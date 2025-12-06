"""Documents/Wiki API routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..services.document import DocumentService
from ..services.auth import Session
from .auth import get_current_session


router = APIRouter(prefix="/api/documents", tags=["documents"])


class DocumentSchema(BaseModel):
    id: int
    title: str
    slug: str
    content: str
    parent_id: Optional[int] = None
    author: str
    last_edited_by: str
    is_pinned: bool
    sort_order: int
    created_at: str
    updated_at: str
    children: list["DocumentSummary"] = []


class DocumentSummary(BaseModel):
    id: int
    title: str
    slug: str
    parent_id: Optional[int] = None
    is_pinned: bool
    sort_order: int
    has_children: bool = False


class CreateDocumentRequest(BaseModel):
    title: str
    content: str = ""
    parent_id: Optional[int] = None
    is_pinned: bool = False


class UpdateDocumentRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    parent_id: Optional[int] = None
    is_pinned: Optional[bool] = None


class ReorderDocumentRequest(BaseModel):
    sort_order: int
    parent_id: Optional[int] = None


def document_to_schema(doc) -> DocumentSchema:
    """Convert a Document model to DocumentSchema."""
    return DocumentSchema(
        id=doc.id,
        title=doc.title,
        slug=doc.slug,
        content=doc.content,
        parent_id=doc.parent_id,
        author=doc.author,
        last_edited_by=doc.last_edited_by,
        is_pinned=doc.is_pinned,
        sort_order=doc.sort_order,
        created_at=doc.created_at.isoformat(),
        updated_at=doc.updated_at.isoformat(),
        children=[
            DocumentSummary(
                id=c.id,
                title=c.title,
                slug=c.slug,
                parent_id=c.parent_id,
                is_pinned=c.is_pinned,
                sort_order=c.sort_order,
                has_children=len(c.children) > 0 if hasattr(c, 'children') and c.children else False,
            )
            for c in (doc.children or [])
        ],
    )


def document_to_summary(doc) -> DocumentSummary:
    """Convert a Document model to DocumentSummary."""
    return DocumentSummary(
        id=doc.id,
        title=doc.title,
        slug=doc.slug,
        parent_id=doc.parent_id,
        is_pinned=doc.is_pinned,
        sort_order=doc.sort_order,
        has_children=len(doc.children) > 0 if hasattr(doc, 'children') and doc.children else False,
    )


@router.get("", response_model=list[DocumentSummary])
async def get_documents(
    parent_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all documents (optionally filtered by parent)."""
    doc_service = DocumentService(db)
    documents = await doc_service.get_all_documents(parent_id=parent_id)
    return [document_to_summary(d) for d in documents]


@router.get("/tree", response_model=list[DocumentSummary])
async def get_document_tree(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get document tree (root documents with children info)."""
    doc_service = DocumentService(db)
    documents = await doc_service.get_document_tree()
    return [document_to_summary(d) for d in documents]


@router.get("/search", response_model=list[DocumentSummary])
async def search_documents(
    q: str,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Search documents by title or content."""
    if len(q) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

    doc_service = DocumentService(db)
    documents = await doc_service.search_documents(q)
    return [document_to_summary(d) for d in documents]


@router.get("/{document_id}", response_model=DocumentSchema)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get a document by ID."""
    doc_service = DocumentService(db)
    document = await doc_service.get_document_by_id(document_id)

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return document_to_schema(document)


@router.get("/slug/{slug}", response_model=DocumentSchema)
async def get_document_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get a document by slug."""
    doc_service = DocumentService(db)
    document = await doc_service.get_document_by_slug(slug)

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return document_to_schema(document)


@router.post("", response_model=DocumentSchema)
async def create_document(
    request: CreateDocumentRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Create a new document."""
    if not request.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    doc_service = DocumentService(db)
    document = await doc_service.create_document(
        title=request.title.strip(),
        content=request.content,
        author=session.username,
        parent_id=request.parent_id,
        is_pinned=request.is_pinned,
    )

    return document_to_schema(document)


@router.put("/{document_id}", response_model=DocumentSchema)
async def update_document(
    document_id: int,
    request: UpdateDocumentRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Update a document."""
    doc_service = DocumentService(db)
    document = await doc_service.update_document(
        document_id=document_id,
        editor=session.username,
        title=request.title.strip() if request.title else None,
        content=request.content,
        parent_id=request.parent_id,
        is_pinned=request.is_pinned,
    )

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return document_to_schema(document)


@router.post("/{document_id}/reorder", response_model=DocumentSchema)
async def reorder_document(
    document_id: int,
    request: ReorderDocumentRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Reorder a document (change position or parent)."""
    doc_service = DocumentService(db)
    document = await doc_service.reorder_document(
        document_id=document_id,
        new_order=request.sort_order,
        new_parent_id=request.parent_id,
    )

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return document_to_schema(document)


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Delete a document and all its children."""
    doc_service = DocumentService(db)
    success = await doc_service.delete_document(document_id)

    if not success:
        raise HTTPException(status_code=404, detail="Document not found")

    return {"message": "Document deleted"}
