"""Google Drive API routes."""

import logging
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from ..services.auth import Session
from ..services.google_drive import get_drive_service, DriveFile
from .auth import get_current_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/drive", tags=["drive"])


# Response models
class DriveStatusResponse(BaseModel):
    enabled: bool
    drives_count: int


class SharedDriveResponse(BaseModel):
    id: str
    name: str


class DriveFileResponse(BaseModel):
    id: str
    name: str
    mime_type: str
    size: Optional[int]
    modified_time: str
    modified_by: Optional[str]
    is_folder: bool
    parent_id: Optional[str]
    web_view_link: Optional[str]
    thumbnail_link: Optional[str]


class FileListResponse(BaseModel):
    files: list[DriveFileResponse]
    next_page_token: Optional[str]


class BreadcrumbItem(BaseModel):
    id: str
    name: str


# Request models
class CreateFolderRequest(BaseModel):
    name: str
    parent_id: str


class RenameRequest(BaseModel):
    new_name: str


class MoveRequest(BaseModel):
    new_parent_id: str


def _file_to_response(file: DriveFile) -> DriveFileResponse:
    """Convert DriveFile to response model."""
    return DriveFileResponse(
        id=file.id,
        name=file.name,
        mime_type=file.mime_type,
        size=file.size,
        modified_time=file.modified_time,
        modified_by=file.modified_by,
        is_folder=file.is_folder,
        parent_id=file.parent_id,
        web_view_link=file.web_view_link,
        thumbnail_link=file.thumbnail_link,
    )


@router.get("/status")
async def get_status(
    session: Session = Depends(get_current_session),
) -> DriveStatusResponse:
    """Get Google Drive integration status."""
    service = get_drive_service()
    return DriveStatusResponse(
        enabled=service.is_enabled(),
        drives_count=len(service.get_shared_drives()) if service.is_enabled() else 0
    )


@router.get("/drives")
async def get_drives(
    session: Session = Depends(get_current_session),
) -> list[SharedDriveResponse]:
    """Get list of configured shared drives."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    drives = service.get_shared_drives()
    return [SharedDriveResponse(id=d.id, name=d.name) for d in drives]


@router.get("/{drive_id}/files")
async def list_files(
    drive_id: str,
    folder_id: Optional[str] = Query(None, description="Folder ID to list (None for root)"),
    page_token: Optional[str] = Query(None, description="Pagination token"),
    page_size: int = Query(100, ge=1, le=1000, description="Number of files per page"),
    order_by: str = Query("folder,name", description="Sort order"),
    session: Session = Depends(get_current_session),
) -> FileListResponse:
    """List files in a shared drive or folder."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        files, next_token = await service.list_files(
            drive_id=drive_id,
            folder_id=folder_id,
            page_token=page_token,
            page_size=page_size,
            order_by=order_by
        )

        return FileListResponse(
            files=[_file_to_response(f) for f in files],
            next_page_token=next_token
        )

    except Exception as e:
        logger.error(f"Error listing files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{drive_id}/search")
async def search_files(
    drive_id: str,
    q: str = Query(..., min_length=1, description="Search query"),
    page_size: int = Query(50, ge=1, le=100, description="Maximum results"),
    session: Session = Depends(get_current_session),
) -> list[DriveFileResponse]:
    """Search for files in a shared drive."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        files = await service.search_files(
            drive_id=drive_id,
            query=q,
            page_size=page_size
        )

        return [_file_to_response(f) for f in files]

    except Exception as e:
        logger.error(f"Error searching files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{drive_id}/breadcrumbs")
async def get_breadcrumbs(
    drive_id: str,
    folder_id: Optional[str] = Query(None, description="Current folder ID"),
    session: Session = Depends(get_current_session),
) -> list[BreadcrumbItem]:
    """Get breadcrumb path for a folder."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        breadcrumbs = await service.get_breadcrumbs(drive_id, folder_id)
        return [BreadcrumbItem(**b) for b in breadcrumbs]

    except Exception as e:
        logger.error(f"Error getting breadcrumbs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}")
async def get_file(
    file_id: str,
    session: Session = Depends(get_current_session),
) -> DriveFileResponse:
    """Get file metadata."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        file = await service.get_file(file_id)
        return _file_to_response(file)

    except Exception as e:
        logger.error(f"Error getting file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    session: Session = Depends(get_current_session),
):
    """Download a file."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        content, filename, mime_type = await service.download_file(file_id)

        # Use RFC 5987 encoding for filenames with Unicode characters
        encoded_filename = quote(filename)
        return StreamingResponse(
            io.BytesIO(content),
            media_type=mime_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(len(content))
            }
        )

    except Exception as e:
        logger.error(f"Error downloading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{file_id}/preview")
async def preview_file(
    file_id: str,
    session: Session = Depends(get_current_session),
):
    """Preview a file (inline display for PDFs, images)."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        content, filename, mime_type = await service.download_file(file_id)

        # Use RFC 5987 encoding for filenames with Unicode characters
        encoded_filename = quote(filename)
        return StreamingResponse(
            io.BytesIO(content),
            media_type=mime_type,
            headers={
                "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(len(content))
            }
        )

    except Exception as e:
        logger.error(f"Error previewing file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{drive_id}/upload")
async def upload_file(
    drive_id: str,
    parent_id: str = Query(..., description="Parent folder ID"),
    file: UploadFile = File(...),
    session: Session = Depends(get_current_session),
) -> DriveFileResponse:
    """Upload a file to a folder."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    try:
        content = await file.read()
        mime_type = file.content_type or 'application/octet-stream'

        uploaded = await service.upload_file(
            drive_id=drive_id,
            parent_id=parent_id,
            filename=file.filename,
            content=content,
            mime_type=mime_type
        )

        return _file_to_response(uploaded)

    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{drive_id}/folder")
async def create_folder(
    drive_id: str,
    request: CreateFolderRequest,
    session: Session = Depends(get_current_session),
) -> DriveFileResponse:
    """Create a new folder."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        folder = await service.create_folder(
            drive_id=drive_id,
            parent_id=request.parent_id,
            name=request.name
        )

        return _file_to_response(folder)

    except Exception as e:
        logger.error(f"Error creating folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/files/{file_id}/rename")
async def rename_file(
    file_id: str,
    request: RenameRequest,
    session: Session = Depends(get_current_session),
) -> DriveFileResponse:
    """Rename a file or folder."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        file = await service.rename_file(file_id, request.new_name)
        return _file_to_response(file)

    except Exception as e:
        logger.error(f"Error renaming file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/files/{file_id}/move")
async def move_file(
    file_id: str,
    request: MoveRequest,
    session: Session = Depends(get_current_session),
) -> DriveFileResponse:
    """Move a file or folder to a different location."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        file = await service.move_file(file_id, request.new_parent_id)
        return _file_to_response(file)

    except Exception as e:
        logger.error(f"Error moving file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    session: Session = Depends(get_current_session),
) -> dict:
    """Delete a file or folder (moves to trash)."""
    service = get_drive_service()

    if not service.is_enabled():
        raise HTTPException(status_code=503, detail="Google Drive integration is not enabled")

    try:
        await service.delete_file(file_id)
        return {"message": "File deleted successfully"}

    except Exception as e:
        logger.error(f"Error deleting file: {e}")
        raise HTTPException(status_code=500, detail=str(e))
