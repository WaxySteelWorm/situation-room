"""API routers for Situation Room."""

from .auth import router as auth_router
from .tasks import router as tasks_router
from .credentials import router as credentials_router
from .dashboard import router as dashboard_router
from .documents import router as documents_router
from .columns import router as columns_router
from .uploads import router as uploads_router
from .users import router as users_router
from .monitoring import router as monitoring_router

__all__ = [
    "auth_router",
    "tasks_router",
    "credentials_router",
    "dashboard_router",
    "documents_router",
    "columns_router",
    "uploads_router",
    "users_router",
    "monitoring_router",
]
