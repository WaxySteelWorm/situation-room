"""Document/Wiki service for managing internal documentation."""

import re
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.document import Document


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    # Convert to lowercase and replace spaces with hyphens
    slug = text.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug


class DocumentService:
    """Service for managing documents/wiki pages."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_documents(self, parent_id: Optional[int] = None) -> list[Document]:
        """Get all documents, optionally filtered by parent."""
        query = select(Document).options(
            selectinload(Document.children)
        )

        if parent_id is None:
            query = query.where(Document.parent_id == None)
        else:
            query = query.where(Document.parent_id == parent_id)

        query = query.order_by(Document.is_pinned.desc(), Document.sort_order, Document.title)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_document_tree(self) -> list[Document]:
        """Get all documents with their children (tree structure)."""
        query = select(Document).where(
            Document.parent_id == None
        ).options(
            selectinload(Document.children)
        ).order_by(Document.is_pinned.desc(), Document.sort_order, Document.title)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_document_by_id(self, document_id: int) -> Optional[Document]:
        """Get a document by ID."""
        query = select(Document).options(
            selectinload(Document.children),
            selectinload(Document.parent),
        ).where(Document.id == document_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_document_by_slug(self, slug: str) -> Optional[Document]:
        """Get a document by slug."""
        query = select(Document).options(
            selectinload(Document.children),
            selectinload(Document.parent),
        ).where(Document.slug == slug)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create_document(
        self,
        title: str,
        content: str,
        author: str,
        parent_id: Optional[int] = None,
        is_pinned: bool = False,
    ) -> Document:
        """Create a new document."""
        # Generate unique slug
        base_slug = slugify(title)
        slug = base_slug
        counter = 1

        while await self.get_document_by_slug(slug):
            slug = f"{base_slug}-{counter}"
            counter += 1

        # Get max sort order
        if parent_id:
            result = await self.db.execute(
                select(Document.sort_order)
                .where(Document.parent_id == parent_id)
                .order_by(Document.sort_order.desc())
                .limit(1)
            )
        else:
            result = await self.db.execute(
                select(Document.sort_order)
                .where(Document.parent_id == None)
                .order_by(Document.sort_order.desc())
                .limit(1)
            )
        max_order = result.scalar_one_or_none() or 0

        document = Document(
            title=title,
            slug=slug,
            content=content,
            author=author,
            last_edited_by=author,
            parent_id=parent_id,
            is_pinned=is_pinned,
            sort_order=max_order + 1,
        )

        self.db.add(document)
        await self.db.flush()

        return await self.get_document_by_id(document.id)

    async def update_document(
        self,
        document_id: int,
        editor: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        parent_id: Optional[int] = None,
        is_pinned: Optional[bool] = None,
    ) -> Optional[Document]:
        """Update an existing document."""
        document = await self.get_document_by_id(document_id)
        if document is None:
            return None

        if title is not None and title != document.title:
            document.title = title
            # Regenerate slug if title changed
            base_slug = slugify(title)
            slug = base_slug
            counter = 1

            while True:
                existing = await self.get_document_by_slug(slug)
                if existing is None or existing.id == document_id:
                    break
                slug = f"{base_slug}-{counter}"
                counter += 1

            document.slug = slug

        if content is not None:
            document.content = content

        if parent_id is not None:
            # Prevent circular reference
            if parent_id != document.id:
                document.parent_id = parent_id if parent_id > 0 else None

        if is_pinned is not None:
            document.is_pinned = is_pinned

        document.last_edited_by = editor

        await self.db.flush()
        return await self.get_document_by_id(document_id)

    async def delete_document(self, document_id: int) -> bool:
        """Delete a document and all its children."""
        document = await self.get_document_by_id(document_id)
        if document is None:
            return False

        await self.db.delete(document)
        await self.db.flush()
        return True

    async def reorder_document(
        self, document_id: int, new_order: int, new_parent_id: Optional[int] = None
    ) -> Optional[Document]:
        """Change the order/position of a document."""
        document = await self.get_document_by_id(document_id)
        if document is None:
            return None

        if new_parent_id is not None:
            document.parent_id = new_parent_id if new_parent_id > 0 else None

        document.sort_order = new_order

        await self.db.flush()
        return await self.get_document_by_id(document_id)

    async def search_documents(self, query: str) -> list[Document]:
        """Search documents by title or content."""
        search_pattern = f"%{query}%"
        stmt = select(Document).where(
            (Document.title.ilike(search_pattern)) |
            (Document.content.ilike(search_pattern))
        ).order_by(Document.updated_at.desc())

        result = await self.db.execute(stmt)
        return list(result.scalars().all())
