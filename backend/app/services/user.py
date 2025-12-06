"""User service for managing SSO users."""

from datetime import datetime
from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User


class UserService:
    """Service for managing users."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_users(self, active_only: bool = True) -> list[User]:
        """Get all users."""
        query = select(User).order_by(User.name)
        if active_only:
            query = query.where(User.is_active == True)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get a user by ID."""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get a user by email."""
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def search_users(self, query: str, limit: int = 10) -> list[User]:
        """Search users by name or email."""
        search_term = f"%{query.lower()}%"
        result = await self.db.execute(
            select(User)
            .where(
                User.is_active == True,
                or_(
                    User.name.ilike(search_term),
                    User.email.ilike(search_term),
                )
            )
            .order_by(User.name)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_user(
        self,
        email: str,
        name: str,
        role: str = "user",
        provider: Optional[str] = None,
        provider_id: Optional[str] = None,
        picture: Optional[str] = None,
    ) -> User:
        """Create a new user."""
        user = User(
            email=email.lower(),
            name=name,
            role=role,
            provider=provider,
            provider_id=provider_id,
            picture=picture,
            is_active=True,
        )
        self.db.add(user)
        await self.db.flush()
        return user

    async def update_user(
        self,
        user_id: int,
        name: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        picture: Optional[str] = None,
    ) -> Optional[User]:
        """Update a user."""
        user = await self.get_user_by_id(user_id)
        if user is None:
            return None

        if name is not None:
            user.name = name
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        if picture is not None:
            user.picture = picture

        await self.db.flush()
        return user

    async def update_last_login(self, user_id: int) -> None:
        """Update user's last login time."""
        user = await self.get_user_by_id(user_id)
        if user:
            user.last_login = datetime.utcnow()
            await self.db.flush()

    async def get_or_create_sso_user(
        self,
        email: str,
        name: str,
        provider: str,
        provider_id: Optional[str] = None,
        picture: Optional[str] = None,
        default_role: str = "user",
    ) -> tuple[User, bool]:
        """
        Get existing user or create new one for SSO login.
        Returns (user, created) tuple.
        """
        user = await self.get_user_by_email(email)

        if user:
            # Update user info from SSO provider
            user.name = name
            user.provider = provider
            if provider_id:
                user.provider_id = provider_id
            if picture:
                user.picture = picture
            user.last_login = datetime.utcnow()
            await self.db.flush()
            return user, False

        # Create new user
        user = await self.create_user(
            email=email,
            name=name,
            role=default_role,
            provider=provider,
            provider_id=provider_id,
            picture=picture,
        )
        user.last_login = datetime.utcnow()
        await self.db.flush()
        return user, True

    async def delete_user(self, user_id: int) -> bool:
        """Delete a user (soft delete by deactivating)."""
        user = await self.get_user_by_id(user_id)
        if user is None:
            return False

        user.is_active = False
        await self.db.flush()
        return True
