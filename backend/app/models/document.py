"""Document/Wiki models for internal documentation."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Document(Base):
    """Document/Wiki page model."""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Parent document for hierarchical structure (optional)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("documents.id"), nullable=True
    )

    # Metadata
    author: Mapped[str] = mapped_column(String(100), nullable=False)
    last_edited_by: Mapped[str] = mapped_column(String(100), nullable=False)

    # Pinned documents appear at the top
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)

    # Sort order within parent
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Self-referential relationship for children
    children: Mapped[list["Document"]] = relationship(
        "Document",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent: Mapped[Optional["Document"]] = relationship(
        "Document",
        back_populates="children",
        remote_side=[id],
    )
