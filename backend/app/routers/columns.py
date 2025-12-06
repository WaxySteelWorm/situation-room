"""Columns API routes for custom Kanban columns."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..services.column import ColumnService
from ..services.auth import Session
from .auth import get_current_session


router = APIRouter(prefix="/api/columns", tags=["columns"])


class ColumnSchema(BaseModel):
    id: int
    name: str
    slug: str
    color: str
    position: int


class CreateColumnRequest(BaseModel):
    name: str
    color: str = "gray"
    position: Optional[int] = None


class UpdateColumnRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None


class ReorderColumnsRequest(BaseModel):
    column_ids: list[int]


def column_to_schema(column) -> ColumnSchema:
    """Convert a Column model to ColumnSchema."""
    return ColumnSchema(
        id=column.id,
        name=column.name,
        slug=column.slug,
        color=column.color,
        position=column.position,
    )


@router.get("", response_model=list[ColumnSchema])
async def get_columns(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all columns ordered by position."""
    column_service = ColumnService(db)
    columns = await column_service.get_all_columns()
    return [column_to_schema(c) for c in columns]


@router.post("", response_model=ColumnSchema)
async def create_column(
    request: CreateColumnRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Create a new column."""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    column_service = ColumnService(db)
    column = await column_service.create_column(
        name=request.name.strip(),
        color=request.color,
        position=request.position,
    )

    return column_to_schema(column)


@router.put("/{column_id}", response_model=ColumnSchema)
async def update_column(
    column_id: int,
    request: UpdateColumnRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Update a column."""
    column_service = ColumnService(db)
    column = await column_service.update_column(
        column_id=column_id,
        name=request.name.strip() if request.name else None,
        color=request.color,
        position=request.position,
    )

    if column is None:
        raise HTTPException(status_code=404, detail="Column not found")

    return column_to_schema(column)


@router.delete("/{column_id}")
async def delete_column(
    column_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Delete a column."""
    column_service = ColumnService(db)

    # Get current columns to prevent deleting the last one
    columns = await column_service.get_all_columns()
    if len(columns) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the last column"
        )

    success = await column_service.delete_column(column_id)

    if not success:
        raise HTTPException(status_code=404, detail="Column not found")

    return {"message": "Column deleted"}


@router.post("/reorder", response_model=list[ColumnSchema])
async def reorder_columns(
    request: ReorderColumnsRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Reorder columns by providing the new order of IDs."""
    column_service = ColumnService(db)
    columns = await column_service.reorder_columns(request.column_ids)
    return [column_to_schema(c) for c in columns]
