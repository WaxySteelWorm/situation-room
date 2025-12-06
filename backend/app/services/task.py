"""Task service for Kanban board operations."""

from datetime import datetime, timedelta
from typing import Optional
from dateutil.relativedelta import relativedelta

from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.task import Task, TaskComment, TaskLabel, TaskStatus, RecurrenceInterval


class TaskService:
    """Service for managing Kanban tasks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_tasks(
        self, include_archived: bool = False
    ) -> list[Task]:
        """Get all tasks, optionally including archived ones."""
        query = select(Task).options(
            selectinload(Task.comments),
            selectinload(Task.labels),
        )

        if not include_archived:
            query = query.where(Task.is_archived == False)

        query = query.order_by(Task.position, Task.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_tasks_by_status(
        self, status: TaskStatus, include_archived: bool = False
    ) -> list[Task]:
        """Get tasks by status."""
        query = select(Task).options(
            selectinload(Task.comments),
            selectinload(Task.labels),
        ).where(Task.status == status.value)

        if not include_archived:
            query = query.where(Task.is_archived == False)

        query = query.order_by(Task.position, Task.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_task_by_id(self, task_id: int) -> Optional[Task]:
        """Get a single task by ID."""
        query = select(Task).options(
            selectinload(Task.comments),
            selectinload(Task.labels),
        ).where(Task.id == task_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create_task(
        self,
        title: str,
        description: Optional[str] = None,
        assignee: Optional[str] = None,
        due_date: Optional[datetime] = None,
        priority: str = "medium",
        is_recurring: bool = False,
        recurrence_interval: Optional[str] = None,
        labels: Optional[list[dict]] = None,
    ) -> Task:
        """Create a new task."""
        # Get max position for todo column
        result = await self.db.execute(
            select(Task.position)
            .where(Task.status == TaskStatus.TODO.value)
            .order_by(Task.position.desc())
            .limit(1)
        )
        max_pos = result.scalar_one_or_none() or 0

        task = Task(
            title=title,
            description=description,
            assignee=assignee,
            due_date=due_date,
            priority=priority,
            is_recurring=is_recurring,
            recurrence_interval=recurrence_interval,
            position=max_pos + 1,
        )

        self.db.add(task)
        await self.db.flush()

        # Add labels if provided
        if labels:
            for label_data in labels:
                label = TaskLabel(
                    task_id=task.id,
                    name=label_data.get("name", ""),
                    color=label_data.get("color", "#3b82f6"),
                )
                self.db.add(label)

        await self.db.flush()

        # Reload with relationships
        return await self.get_task_by_id(task.id)

    async def update_task(
        self,
        task_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        assignee: Optional[str] = None,
        due_date: Optional[datetime] = None,
        priority: Optional[str] = None,
        position: Optional[int] = None,
    ) -> Optional[Task]:
        """Update a task."""
        task = await self.get_task_by_id(task_id)
        if task is None:
            return None

        old_status = task.status

        if title is not None:
            task.title = title
        if description is not None:
            task.description = description
        if status is not None:
            task.status = status
        if assignee is not None:
            task.assignee = assignee
        if due_date is not None:
            task.due_date = due_date
        if priority is not None:
            task.priority = priority
        if position is not None:
            task.position = position

        task.updated_at = datetime.utcnow()

        # Handle completion
        if status == TaskStatus.DONE.value and old_status != TaskStatus.DONE.value:
            task.completed_at = datetime.utcnow()

            # Handle recurring task
            if task.is_recurring and task.recurrence_interval:
                await self._create_next_occurrence(task)

        await self.db.flush()
        return await self.get_task_by_id(task_id)

    async def _create_next_occurrence(self, task: Task) -> Task:
        """Create the next occurrence of a recurring task."""
        next_due_date = None

        if task.due_date:
            if task.recurrence_interval == RecurrenceInterval.DAILY.value:
                next_due_date = task.due_date + timedelta(days=1)
            elif task.recurrence_interval == RecurrenceInterval.WEEKLY.value:
                next_due_date = task.due_date + timedelta(weeks=1)
            elif task.recurrence_interval == RecurrenceInterval.MONTHLY.value:
                next_due_date = task.due_date + relativedelta(months=1)

        # Create new task
        return await self.create_task(
            title=task.title,
            description=task.description,
            assignee=task.assignee,
            due_date=next_due_date,
            priority=task.priority,
            is_recurring=True,
            recurrence_interval=task.recurrence_interval,
            labels=[{"name": l.name, "color": l.color} for l in task.labels],
        )

    async def archive_task(self, task_id: int) -> Optional[Task]:
        """Archive a task (tasks are never deleted)."""
        task = await self.get_task_by_id(task_id)
        if task is None:
            return None

        task.is_archived = True
        task.updated_at = datetime.utcnow()
        await self.db.flush()
        return task

    async def move_task(
        self, task_id: int, new_status: str, new_position: int
    ) -> Optional[Task]:
        """Move a task to a new column and position."""
        task = await self.get_task_by_id(task_id)
        if task is None:
            return None

        old_status = task.status

        # Update positions in the target column
        await self.db.execute(
            update(Task)
            .where(
                and_(
                    Task.status == new_status,
                    Task.position >= new_position,
                    Task.id != task_id,
                )
            )
            .values(position=Task.position + 1)
        )

        task.status = new_status
        task.position = new_position
        task.updated_at = datetime.utcnow()

        # Handle completion
        if new_status == TaskStatus.DONE.value and old_status != TaskStatus.DONE.value:
            task.completed_at = datetime.utcnow()

            # Handle recurring task
            if task.is_recurring and task.recurrence_interval:
                await self._create_next_occurrence(task)

        await self.db.flush()
        return await self.get_task_by_id(task_id)

    async def add_comment(
        self, task_id: int, author: str, content: str
    ) -> Optional[TaskComment]:
        """Add a comment to a task."""
        task = await self.get_task_by_id(task_id)
        if task is None:
            return None

        comment = TaskComment(
            task_id=task_id,
            author=author,
            content=content,
        )
        self.db.add(comment)
        await self.db.flush()
        return comment

    async def add_label(
        self, task_id: int, name: str, color: str = "#3b82f6"
    ) -> Optional[TaskLabel]:
        """Add a label to a task."""
        task = await self.get_task_by_id(task_id)
        if task is None:
            return None

        label = TaskLabel(
            task_id=task_id,
            name=name,
            color=color,
        )
        self.db.add(label)
        await self.db.flush()
        return label

    async def remove_label(self, label_id: int) -> bool:
        """Remove a label from a task."""
        result = await self.db.execute(
            select(TaskLabel).where(TaskLabel.id == label_id)
        )
        label = result.scalar_one_or_none()
        if label is None:
            return False

        await self.db.delete(label)
        await self.db.flush()
        return True

    async def get_tasks_due_soon(self, days: int = 1) -> list[Task]:
        """Get tasks due within the specified number of days."""
        now = datetime.utcnow()
        due_threshold = now + timedelta(days=days)

        query = select(Task).options(
            selectinload(Task.comments),
            selectinload(Task.labels),
        ).where(
            and_(
                Task.is_archived == False,
                Task.status != TaskStatus.DONE.value,
                Task.due_date != None,
                Task.due_date <= due_threshold,
                Task.due_date >= now,
            )
        ).order_by(Task.due_date)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_tasks_by_assignee(self, assignee: str) -> list[Task]:
        """Get all active tasks assigned to a user."""
        query = select(Task).options(
            selectinload(Task.comments),
            selectinload(Task.labels),
        ).where(
            and_(
                Task.is_archived == False,
                Task.assignee == assignee,
            )
        ).order_by(Task.due_date, Task.priority)

        result = await self.db.execute(query)
        return list(result.scalars().all())
