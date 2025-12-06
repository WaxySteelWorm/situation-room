"""File upload API routes for documents."""

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..services.auth import Session
from .auth import get_current_session
from ..config import get_config


router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Allowed file types
ALLOWED_EXTENSIONS = {
    # Images
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    # Documents
    '.pdf', '.drawio', '.xml',
    # Archives (for drawio exports)
    '.zip',
}

ALLOWED_MIME_TYPES = {
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/xml', 'text/xml',
    'application/zip', 'application/x-zip-compressed',
    'application/octet-stream',  # For .drawio files
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def get_upload_dir() -> Path:
    """Get the upload directory path."""
    config = get_config()
    # Use data directory from config, or default
    data_dir = Path(config.database.path).parent
    upload_dir = data_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    session: Session = Depends(get_current_session),
):
    """Upload a file and return its URL."""
    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Check content type (optional, as some files may have generic types)
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        # Allow if extension is valid even if mime type is unexpected
        pass

    # Read file and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB"
        )

    # Generate unique filename
    unique_id = uuid.uuid4().hex[:12]
    safe_filename = f"{unique_id}{ext}"

    # Save file
    upload_dir = get_upload_dir()
    file_path = upload_dir / safe_filename

    with open(file_path, 'wb') as f:
        f.write(content)

    # Return the URL
    return {
        "url": f"/api/uploads/{safe_filename}",
        "filename": file.filename,
        "size": len(content),
    }


@router.get("/{filename}")
async def get_file(
    filename: str,
    session: Session = Depends(get_current_session),
):
    """Serve an uploaded file."""
    # Validate filename (prevent path traversal)
    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    upload_dir = get_upload_dir()
    file_path = upload_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine content type
    ext = Path(filename).suffix.lower()
    content_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.drawio': 'application/xml',
        '.xml': 'application/xml',
        '.zip': 'application/zip',
    }

    return FileResponse(
        file_path,
        media_type=content_types.get(ext, 'application/octet-stream'),
        filename=filename,
    )


@router.delete("/{filename}")
async def delete_file(
    filename: str,
    session: Session = Depends(get_current_session),
):
    """Delete an uploaded file."""
    # Validate filename
    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    upload_dir = get_upload_dir()
    file_path = upload_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(file_path)
    return {"message": "File deleted"}
