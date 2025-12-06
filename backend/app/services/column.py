"""Column service for managing Kanban columns."""

import re
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.column import Column


# Default columns if none exist
DEFAULT_COLUMNS = [
    {"name": "To Do", "slug": "todo", "color": "gray", "position": 0},
    {"name": "In Progress", "slug": "in_progress", "color": "amber", "position": 1},
    {"name": "Done", "slug": "done", "color": "green", "position": 2},
]


class ColumnService:
    """Service for managing custom Kanban columns."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _generate_slug(self, name: str) -> str:
        """Generate a URL-safe slug from a name."""
        slug = name.lower().strip()
        slug = re.sub(r'[^a-z0-9\s-]', '', slug)
        slug = re.sub(r'[\s-]+', '_', slug)
        return slug

    async def get_all_columns(self) -> list[Column]:
        """Get all columns ordered by position."""
        result = await self.db.execute(
            select(Column).order_by(Column.position)
        )
        columns = list(result.scalars().all())

        # If no columns exist, create defaults
        if not columns:
            columns = await self._create_default_columns()

        return columns

    async def _create_default_columns(self) -> list[Column]:
        """Create default columns if none exist."""
        columns = []
        for col_data in DEFAULT_COLUMNS:
            column = Column(**col_data)
            self.db.add(column)
            columns.append(column)
        await self.db.flush()
        return columns

    async def get_column_by_id(self, column_id: int) -> Optional[Column]:
        """Get a column by ID."""
        result = await self.db.execute(
            select(Column).where(Column.id == column_id)
        )
        return result.scalar_one_or_none()

    async def get_column_by_slug(self, slug: str) -> Optional[Column]:
        """Get a column by slug."""
        result = await self.db.execute(
            select(Column).where(Column.slug == slug)
        )
        return result.scalar_one_or_none()

    async def create_column(
        self,
        name: str,
        color: str = "gray",
        position: Optional[int] = None,
    ) -> Column:
        """Create a new column."""
        # Generate unique slug
        base_slug = self._generate_slug(name)
        slug = base_slug
        counter = 1

        while await self.get_column_by_slug(slug):
            slug = f"{base_slug}_{counter}"
            counter += 1

        # If position not specified, add at the end
        if position is None:
            result = await self.db.execute(
                select(func.max(Column.position))
            )
            max_pos = result.scalar() or -1
            position = max_pos + 1

        column = Column(
            name=name,
            slug=slug,
            color=color,
            position=position,
        )
        self.db.add(column)
        await self.db.flush()

        return column

    async def update_column(
        self,
        column_id: int,
        name: Optional[str] = None,
        color: Optional[str] = None,
        position: Optional[int] = None,
    ) -> Optional[Column]:
        """Update a column."""
        column = await self.get_column_by_id(column_id)
        if column is None:
            return None

        if name is not None:
            column.name = name
            # Update slug if name changed
            base_slug = self._generate_slug(name)
            if base_slug != column.slug:
                slug = base_slug
                counter = 1
                while True:
                    existing = await self.get_column_by_slug(slug)
                    if existing is None or existing.id == column_id:
                        break
                    slug = f"{base_slug}_{counter}"
                    counter += 1
                column.slug = slug

        if color is not None:
            column.color = color

        if position is not None:
            column.position = position

        await self.db.flush()
        return column

    async def delete_column(self, column_id: int) -> bool:
        """Delete a column."""
        column = await self.get_column_by_id(column_id)
        if column is None:
            return False

        await self.db.delete(column)
        await self.db.flush()
        return True

    async def reorder_columns(self, column_ids: list[int]) -> list[Column]:
        """Reorder columns by providing the new order of IDs."""
        columns = []
        for i, col_id in enumerate(column_ids):
            column = await self.get_column_by_id(col_id)
            if column:
                column.position = i
                columns.append(column)

        await self.db.flush()
        return columns
