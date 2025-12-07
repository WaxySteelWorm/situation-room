"""Database setup and connection management."""

import os
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from ..config import get_config


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


_engine = None
_async_session_factory = None


def get_database_url() -> str:
    """Get the database URL from configuration."""
    config = get_config()
    db_path = config.database.path

    # Ensure directory exists
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    return f"sqlite+aiosqlite:///{db_path}"


async def init_db() -> None:
    """Initialize the database, creating tables if needed."""
    global _engine, _async_session_factory

    database_url = get_database_url()
    _engine = create_async_engine(
        database_url,
        echo=get_config().logging.level == "debug",
    )

    _async_session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Import all models to register them
    from . import task, credential, document, column, user, monitoring, network  # noqa: F401

    # Create tables
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session."""
    if _async_session_factory is None:
        await init_db()

    async with _async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
