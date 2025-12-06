"""Dashboard API routes."""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..models.database import get_db
from ..models.task import Task, TaskStatus
from ..services.task import TaskService
from ..services.auth import Session
from .auth import get_current_session


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class TaskSummary(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    due_date: str | None
    assignee: str | None


class DashboardStats(BaseModel):
    total_tasks: int
    todo_count: int
    in_progress_count: int
    done_count: int
    overdue_count: int
    my_tasks_count: int


class SystemHealthPlaceholder(BaseModel):
    """Placeholder for v2 monitoring integration."""
    status: str = "placeholder"
    message: str = "System health monitoring coming in v2"


class AnsibleJobPlaceholder(BaseModel):
    """Placeholder for v2 Ansible integration."""
    status: str = "placeholder"
    message: str = "Ansible job history coming in v2"


class DashboardResponse(BaseModel):
    stats: DashboardStats
    tasks_due_soon: list[TaskSummary]
    recent_tasks: list[TaskSummary]
    system_health: SystemHealthPlaceholder
    ansible_jobs: AnsibleJobPlaceholder


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get dashboard summary data."""
    task_service = TaskService(db)
    now = datetime.utcnow()

    # Get task counts by status
    todo_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.is_archived == False,
            Task.status == TaskStatus.TODO.value,
        )
    )
    todo_count = todo_result.scalar() or 0

    in_progress_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.is_archived == False,
            Task.status == TaskStatus.IN_PROGRESS.value,
        )
    )
    in_progress_count = in_progress_result.scalar() or 0

    done_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.is_archived == False,
            Task.status == TaskStatus.DONE.value,
        )
    )
    done_count = done_result.scalar() or 0

    # Get overdue count
    overdue_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.is_archived == False,
            Task.status != TaskStatus.DONE.value,
            Task.due_date != None,
            Task.due_date < now,
        )
    )
    overdue_count = overdue_result.scalar() or 0

    # Get my tasks count
    my_tasks_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.is_archived == False,
            Task.assignee == session.username,
            Task.status != TaskStatus.DONE.value,
        )
    )
    my_tasks_count = my_tasks_result.scalar() or 0

    total_tasks = todo_count + in_progress_count + done_count

    # Get tasks due soon (within 3 days)
    tasks_due_soon = await task_service.get_tasks_due_soon(days=3)
    due_soon_summaries = [
        TaskSummary(
            id=t.id,
            title=t.title,
            status=t.status,
            priority=t.priority,
            due_date=t.due_date.isoformat() if t.due_date else None,
            assignee=t.assignee,
        )
        for t in tasks_due_soon[:5]  # Limit to 5
    ]

    # Get recent tasks (last 5 updated)
    recent_result = await db.execute(
        select(Task)
        .where(Task.is_archived == False)
        .order_by(Task.updated_at.desc())
        .limit(5)
    )
    recent_tasks = recent_result.scalars().all()
    recent_summaries = [
        TaskSummary(
            id=t.id,
            title=t.title,
            status=t.status,
            priority=t.priority,
            due_date=t.due_date.isoformat() if t.due_date else None,
            assignee=t.assignee,
        )
        for t in recent_tasks
    ]

    return DashboardResponse(
        stats=DashboardStats(
            total_tasks=total_tasks,
            todo_count=todo_count,
            in_progress_count=in_progress_count,
            done_count=done_count,
            overdue_count=overdue_count,
            my_tasks_count=my_tasks_count,
        ),
        tasks_due_soon=due_soon_summaries,
        recent_tasks=recent_summaries,
        system_health=SystemHealthPlaceholder(),
        ansible_jobs=AnsibleJobPlaceholder(),
    )
