"""Task/Kanban API routes."""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.task import TaskStatus, TaskPriority, RecurrenceInterval
from ..services.task import TaskService
from ..services.notification import NotificationService
from ..services.auth import Session
from ..config import get_config
from .auth import get_current_session


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class LabelSchema(BaseModel):
    id: Optional[int] = None
    name: str
    color: str = "#3b82f6"


class CommentSchema(BaseModel):
    id: int
    author: str
    content: str
    created_at: str


class TaskSchema(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    is_recurring: bool
    recurrence_interval: Optional[str] = None
    is_archived: bool
    position: int
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    labels: list[LabelSchema]
    comments: list[CommentSchema]


class CreateTaskRequest(BaseModel):
    title: str
    description: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: str = TaskPriority.MEDIUM.value
    is_recurring: bool = False
    recurrence_interval: Optional[str] = None
    labels: Optional[list[LabelSchema]] = None


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    position: Optional[int] = None


class MoveTaskRequest(BaseModel):
    status: str
    position: int


class AddCommentRequest(BaseModel):
    content: str


class AddLabelRequest(BaseModel):
    name: str
    color: str = "#3b82f6"


def task_to_schema(task) -> TaskSchema:
    """Convert a Task model to TaskSchema."""
    return TaskSchema(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        assignee=task.assignee,
        due_date=task.due_date.isoformat() if task.due_date else None,
        is_recurring=task.is_recurring,
        recurrence_interval=task.recurrence_interval,
        is_archived=task.is_archived,
        position=task.position,
        created_at=task.created_at.isoformat(),
        updated_at=task.updated_at.isoformat(),
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
        labels=[
            LabelSchema(id=l.id, name=l.name, color=l.color) for l in task.labels
        ],
        comments=[
            CommentSchema(
                id=c.id,
                author=c.author,
                content=c.content,
                created_at=c.created_at.isoformat(),
            )
            for c in task.comments
        ],
    )


@router.get("", response_model=list[TaskSchema])
async def get_tasks(
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all tasks."""
    task_service = TaskService(db)
    tasks = await task_service.get_all_tasks(include_archived=include_archived)
    return [task_to_schema(t) for t in tasks]


@router.get("/status/{status}", response_model=list[TaskSchema])
async def get_tasks_by_status(
    status: str,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get tasks by status."""
    try:
        task_status = TaskStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    task_service = TaskService(db)
    tasks = await task_service.get_tasks_by_status(
        task_status, include_archived=include_archived
    )
    return [task_to_schema(t) for t in tasks]


@router.get("/due-soon", response_model=list[TaskSchema])
async def get_tasks_due_soon(
    days: int = 1,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get tasks due within the specified number of days."""
    task_service = TaskService(db)
    tasks = await task_service.get_tasks_due_soon(days=days)
    return [task_to_schema(t) for t in tasks]


@router.get("/my-tasks", response_model=list[TaskSchema])
async def get_my_tasks(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get tasks assigned to the current user."""
    task_service = TaskService(db)
    tasks = await task_service.get_tasks_by_assignee(session.username)
    return [task_to_schema(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskSchema)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get a single task by ID."""
    task_service = TaskService(db)
    task = await task_service.get_task_by_id(task_id)

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return task_to_schema(task)


@router.post("", response_model=TaskSchema)
async def create_task(
    request: CreateTaskRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Create a new task."""
    task_service = TaskService(db)
    notification_service = NotificationService()

    labels = None
    if request.labels:
        labels = [{"name": l.name, "color": l.color} for l in request.labels]

    task = await task_service.create_task(
        title=request.title,
        description=request.description,
        assignee=request.assignee,
        due_date=request.due_date,
        priority=request.priority,
        is_recurring=request.is_recurring,
        recurrence_interval=request.recurrence_interval,
        labels=labels,
    )

    # Send notification if task is assigned
    if task.assignee:
        config = get_config()
        assignee_email = None
        for user in config.users:
            if user.username == task.assignee:
                assignee_email = user.email
                break

        await notification_service.notify_task_assigned(
            task, session.username, assignee_email
        )

    return task_to_schema(task)


@router.put("/{task_id}", response_model=TaskSchema)
async def update_task(
    task_id: int,
    request: UpdateTaskRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Update a task."""
    task_service = TaskService(db)
    notification_service = NotificationService()

    # Get current task for comparison
    current_task = await task_service.get_task_by_id(task_id)
    if current_task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    old_status = current_task.status
    old_assignee = current_task.assignee

    task = await task_service.update_task(
        task_id=task_id,
        title=request.title,
        description=request.description,
        status=request.status,
        assignee=request.assignee,
        due_date=request.due_date,
        priority=request.priority,
        position=request.position,
    )

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    config = get_config()

    # Send notification if assignee changed
    if request.assignee and request.assignee != old_assignee:
        assignee_email = None
        for user in config.users:
            if user.username == request.assignee:
                assignee_email = user.email
                break

        await notification_service.notify_task_assigned(
            task, session.username, assignee_email
        )

    # Send notification if status changed
    if request.status and request.status != old_status:
        assignee_email = None
        if task.assignee:
            for user in config.users:
                if user.username == task.assignee:
                    assignee_email = user.email
                    break

        await notification_service.notify_status_changed(
            task, old_status, request.status, session.username, assignee_email
        )

    return task_to_schema(task)


@router.post("/{task_id}/move", response_model=TaskSchema)
async def move_task(
    task_id: int,
    request: MoveTaskRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Move a task to a new column and position (drag-and-drop)."""
    task_service = TaskService(db)
    notification_service = NotificationService()

    # Get current task for comparison
    current_task = await task_service.get_task_by_id(task_id)
    if current_task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    old_status = current_task.status

    task = await task_service.move_task(task_id, request.status, request.position)

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Send notification if status changed
    if request.status != old_status:
        config = get_config()
        assignee_email = None
        if task.assignee:
            for user in config.users:
                if user.username == task.assignee:
                    assignee_email = user.email
                    break

        await notification_service.notify_status_changed(
            task, old_status, request.status, session.username, assignee_email
        )

    return task_to_schema(task)


@router.post("/{task_id}/archive", response_model=TaskSchema)
async def archive_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Archive a task (tasks are never deleted)."""
    task_service = TaskService(db)
    task = await task_service.archive_task(task_id)

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return task_to_schema(task)


@router.post("/{task_id}/comments", response_model=CommentSchema)
async def add_comment(
    task_id: int,
    request: AddCommentRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Add a comment to a task."""
    task_service = TaskService(db)
    notification_service = NotificationService()

    task = await task_service.get_task_by_id(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    comment = await task_service.add_comment(
        task_id=task_id,
        author=session.username,
        content=request.content,
    )

    if comment is None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Send notification
    config = get_config()
    assignee_email = None
    if task.assignee and task.assignee != session.username:
        for user in config.users:
            if user.username == task.assignee:
                assignee_email = user.email
                break

    await notification_service.notify_new_comment(
        task, session.username, request.content, assignee_email
    )

    return CommentSchema(
        id=comment.id,
        author=comment.author,
        content=comment.content,
        created_at=comment.created_at.isoformat(),
    )


@router.post("/{task_id}/labels", response_model=LabelSchema)
async def add_label(
    task_id: int,
    request: AddLabelRequest,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Add a label to a task."""
    task_service = TaskService(db)
    label = await task_service.add_label(
        task_id=task_id,
        name=request.name,
        color=request.color,
    )

    if label is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return LabelSchema(id=label.id, name=label.name, color=label.color)


@router.delete("/{task_id}/labels/{label_id}")
async def remove_label(
    task_id: int,
    label_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Remove a label from a task."""
    task_service = TaskService(db)
    success = await task_service.remove_label(label_id)

    if not success:
        raise HTTPException(status_code=404, detail="Label not found")

    return {"message": "Label removed"}
