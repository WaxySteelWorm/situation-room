"""Users API routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..services.user import UserService
from ..services.auth import Session
from .auth import get_current_session


router = APIRouter(prefix="/api/users", tags=["users"])


class UserSchema(BaseModel):
    id: int
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    is_active: bool
    provider: Optional[str] = None
    last_login: Optional[str] = None


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


def user_to_schema(user) -> UserSchema:
    """Convert a User model to UserSchema."""
    return UserSchema(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
        is_active=user.is_active,
        provider=user.provider,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.get("", response_model=list[UserSchema])
async def get_users(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all users."""
    user_service = UserService(db)
    users = await user_service.get_all_users(active_only=active_only)
    return [user_to_schema(u) for u in users]


@router.get("/search", response_model=list[UserSchema])
async def search_users(
    q: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Search users by name or email."""
    if len(q) < 1:
        return []

    user_service = UserService(db)
    users = await user_service.search_users(q, limit=limit)
    return [user_to_schema(u) for u in users]


@router.get("/me", response_model=UserSchema)
async def get_current_user(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get the current logged-in user's profile."""
    user_service = UserService(db)
    user = await user_service.get_user_by_email(session.email or session.username)

    if user is None:
        # Return a synthetic user for config-based users
        return UserSchema(
            id=0,
            email=session.email or f"{session.username}@local",
            name=session.username,
            picture=None,
            role=session.role,
            is_active=True,
            provider=None,
            last_login=None,
        )

    return user_to_schema(user)


@router.get("/{user_id}", response_model=UserSchema)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get a user by ID."""
    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user_to_schema(user)


@router.put("/{user_id}", response_model=UserSchema)
async def update_user(
    user_id: int,
    request: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Update a user (admin only)."""
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    user_service = UserService(db)
    user = await user_service.update_user(
        user_id=user_id,
        name=request.name,
        role=request.role,
        is_active=request.is_active,
    )

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user_to_schema(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Deactivate a user (admin only)."""
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    user_service = UserService(db)
    success = await user_service.delete_user(user_id)

    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "User deactivated"}
