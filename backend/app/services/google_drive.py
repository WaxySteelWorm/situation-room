"""Google Drive service for file management."""

import io
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

from ..config import get_config

logger = logging.getLogger(__name__)

# Google Drive API scopes
SCOPES = ['https://www.googleapis.com/auth/drive']


@dataclass
class DriveFile:
    """Represents a file or folder in Google Drive."""
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


@dataclass
class SharedDrive:
    """Represents a shared drive."""
    id: str
    name: str


class GoogleDriveService:
    """Service for interacting with Google Drive API."""

    def __init__(self):
        self.config = get_config().google_drive
        self._service = None

    def _get_service(self):
        """Get or create the Google Drive service client."""
        if self._service is not None:
            return self._service

        if not self.config.enabled:
            raise RuntimeError("Google Drive integration is not enabled")

        creds_path = Path(self.config.service_account_path)
        if not creds_path.exists():
            raise RuntimeError(f"Service account file not found: {creds_path}")

        credentials = service_account.Credentials.from_service_account_file(
            str(creds_path),
            scopes=SCOPES
        )

        self._service = build('drive', 'v3', credentials=credentials)
        return self._service

    def is_enabled(self) -> bool:
        """Check if Google Drive is enabled and configured."""
        return self.config.enabled

    def get_shared_drives(self) -> list[SharedDrive]:
        """Get the list of configured shared drives."""
        return [
            SharedDrive(id=drive.id, name=drive.name)
            for drive in self.config.shared_drives
        ]

    async def list_files(
        self,
        drive_id: str,
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        page_size: int = 100,
        order_by: str = "folder,name"
    ) -> tuple[list[DriveFile], Optional[str]]:
        """
        List files in a shared drive or folder.

        Args:
            drive_id: The shared drive ID
            folder_id: Optional folder ID to list contents of (None for root)
            page_token: Pagination token for next page
            page_size: Number of files per page
            order_by: Sort order (folder,name, modifiedTime desc, etc.)

        Returns:
            Tuple of (list of files, next page token or None)
        """
        service = self._get_service()

        # Build the query
        parent_id = folder_id if folder_id else drive_id
        query = f"'{parent_id}' in parents and trashed = false"

        try:
            results = service.files().list(
                q=query,
                driveId=drive_id,
                corpora='drive',
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                pageSize=page_size,
                pageToken=page_token,
                orderBy=order_by,
                fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink)"
            ).execute()

            files = []
            for item in results.get('files', []):
                is_folder = item['mimeType'] == 'application/vnd.google-apps.folder'
                files.append(DriveFile(
                    id=item['id'],
                    name=item['name'],
                    mime_type=item['mimeType'],
                    size=int(item.get('size', 0)) if item.get('size') else None,
                    modified_time=item.get('modifiedTime', ''),
                    modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                    is_folder=is_folder,
                    parent_id=item.get('parents', [None])[0],
                    web_view_link=item.get('webViewLink'),
                    thumbnail_link=item.get('thumbnailLink'),
                ))

            return files, results.get('nextPageToken')

        except Exception as e:
            logger.error(f"Error listing files: {e}")
            raise

    async def search_files(
        self,
        drive_id: str,
        query: str,
        page_size: int = 50
    ) -> list[DriveFile]:
        """
        Search for files in a shared drive.

        Args:
            drive_id: The shared drive ID
            query: Search query string
            page_size: Maximum number of results

        Returns:
            List of matching files
        """
        service = self._get_service()

        # Build search query
        search_query = f"name contains '{query}' and trashed = false"

        try:
            results = service.files().list(
                q=search_query,
                driveId=drive_id,
                corpora='drive',
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                pageSize=page_size,
                fields="files(id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink)"
            ).execute()

            files = []
            for item in results.get('files', []):
                is_folder = item['mimeType'] == 'application/vnd.google-apps.folder'
                files.append(DriveFile(
                    id=item['id'],
                    name=item['name'],
                    mime_type=item['mimeType'],
                    size=int(item.get('size', 0)) if item.get('size') else None,
                    modified_time=item.get('modifiedTime', ''),
                    modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                    is_folder=is_folder,
                    parent_id=item.get('parents', [None])[0],
                    web_view_link=item.get('webViewLink'),
                    thumbnail_link=item.get('thumbnailLink'),
                ))

            return files

        except Exception as e:
            logger.error(f"Error searching files: {e}")
            raise

    async def get_file(self, file_id: str) -> DriveFile:
        """
        Get file metadata.

        Args:
            file_id: The file ID

        Returns:
            File metadata
        """
        service = self._get_service()

        try:
            item = service.files().get(
                fileId=file_id,
                supportsAllDrives=True,
                fields="id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink"
            ).execute()

            is_folder = item['mimeType'] == 'application/vnd.google-apps.folder'
            return DriveFile(
                id=item['id'],
                name=item['name'],
                mime_type=item['mimeType'],
                size=int(item.get('size', 0)) if item.get('size') else None,
                modified_time=item.get('modifiedTime', ''),
                modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                is_folder=is_folder,
                parent_id=item.get('parents', [None])[0],
                web_view_link=item.get('webViewLink'),
                thumbnail_link=item.get('thumbnailLink'),
            )

        except Exception as e:
            logger.error(f"Error getting file: {e}")
            raise

    async def download_file(self, file_id: str) -> tuple[bytes, str, str]:
        """
        Download a file.

        Args:
            file_id: The file ID

        Returns:
            Tuple of (file content bytes, filename, mime type)
        """
        service = self._get_service()

        try:
            # Get file metadata first
            file_meta = service.files().get(
                fileId=file_id,
                supportsAllDrives=True,
                fields="name, mimeType"
            ).execute()

            filename = file_meta['name']
            mime_type = file_meta['mimeType']

            # Handle Google Docs export
            google_mime_exports = {
                'application/vnd.google-apps.document': ('application/pdf', '.pdf'),
                'application/vnd.google-apps.spreadsheet': ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'),
                'application/vnd.google-apps.presentation': ('application/pdf', '.pdf'),
                'application/vnd.google-apps.drawing': ('application/pdf', '.pdf'),
            }

            if mime_type in google_mime_exports:
                export_mime, ext = google_mime_exports[mime_type]
                request = service.files().export_media(fileId=file_id, mimeType=export_mime)
                filename = Path(filename).stem + ext
                mime_type = export_mime
            else:
                request = service.files().get_media(fileId=file_id)

            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)

            done = False
            while not done:
                _, done = downloader.next_chunk()

            return buffer.getvalue(), filename, mime_type

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            raise

    async def upload_file(
        self,
        drive_id: str,
        parent_id: str,
        filename: str,
        content: bytes,
        mime_type: str
    ) -> DriveFile:
        """
        Upload a file to a folder.

        Args:
            drive_id: The shared drive ID
            parent_id: The parent folder ID
            filename: The filename
            content: File content as bytes
            mime_type: MIME type of the file

        Returns:
            The created file metadata
        """
        service = self._get_service()

        try:
            file_metadata = {
                'name': filename,
                'parents': [parent_id],
            }

            media = MediaIoBaseUpload(
                io.BytesIO(content),
                mimetype=mime_type,
                resumable=True
            )

            item = service.files().create(
                body=file_metadata,
                media_body=media,
                supportsAllDrives=True,
                fields="id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink"
            ).execute()

            is_folder = item['mimeType'] == 'application/vnd.google-apps.folder'
            return DriveFile(
                id=item['id'],
                name=item['name'],
                mime_type=item['mimeType'],
                size=int(item.get('size', 0)) if item.get('size') else None,
                modified_time=item.get('modifiedTime', ''),
                modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                is_folder=is_folder,
                parent_id=item.get('parents', [None])[0],
                web_view_link=item.get('webViewLink'),
                thumbnail_link=item.get('thumbnailLink'),
            )

        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            raise

    async def create_folder(
        self,
        drive_id: str,
        parent_id: str,
        name: str
    ) -> DriveFile:
        """
        Create a new folder.

        Args:
            drive_id: The shared drive ID
            parent_id: The parent folder ID
            name: The folder name

        Returns:
            The created folder metadata
        """
        service = self._get_service()

        try:
            file_metadata = {
                'name': name,
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [parent_id],
            }

            item = service.files().create(
                body=file_metadata,
                supportsAllDrives=True,
                fields="id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink"
            ).execute()

            return DriveFile(
                id=item['id'],
                name=item['name'],
                mime_type=item['mimeType'],
                size=None,
                modified_time=item.get('modifiedTime', ''),
                modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                is_folder=True,
                parent_id=item.get('parents', [None])[0],
                web_view_link=item.get('webViewLink'),
                thumbnail_link=item.get('thumbnailLink'),
            )

        except Exception as e:
            logger.error(f"Error creating folder: {e}")
            raise

    async def rename_file(self, file_id: str, new_name: str) -> DriveFile:
        """
        Rename a file or folder.

        Args:
            file_id: The file ID
            new_name: The new name

        Returns:
            Updated file metadata
        """
        service = self._get_service()

        try:
            item = service.files().update(
                fileId=file_id,
                body={'name': new_name},
                supportsAllDrives=True,
                fields="id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink"
            ).execute()

            is_folder = item['mimeType'] == 'application/vnd.google-apps.folder'
            return DriveFile(
                id=item['id'],
                name=item['name'],
                mime_type=item['mimeType'],
                size=int(item.get('size', 0)) if item.get('size') else None,
                modified_time=item.get('modifiedTime', ''),
                modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                is_folder=is_folder,
                parent_id=item.get('parents', [None])[0],
                web_view_link=item.get('webViewLink'),
                thumbnail_link=item.get('thumbnailLink'),
            )

        except Exception as e:
            logger.error(f"Error renaming file: {e}")
            raise

    async def move_file(self, file_id: str, new_parent_id: str) -> DriveFile:
        """
        Move a file or folder to a different location.

        Args:
            file_id: The file ID
            new_parent_id: The new parent folder ID

        Returns:
            Updated file metadata
        """
        service = self._get_service()

        try:
            # Get current parents
            file_meta = service.files().get(
                fileId=file_id,
                supportsAllDrives=True,
                fields='parents'
            ).execute()

            previous_parents = ','.join(file_meta.get('parents', []))

            item = service.files().update(
                fileId=file_id,
                addParents=new_parent_id,
                removeParents=previous_parents,
                supportsAllDrives=True,
                fields="id, name, mimeType, size, modifiedTime, lastModifyingUser, parents, webViewLink, thumbnailLink"
            ).execute()

            is_folder = item['mimeType'] == 'application/vnd.google-apps.folder'
            return DriveFile(
                id=item['id'],
                name=item['name'],
                mime_type=item['mimeType'],
                size=int(item.get('size', 0)) if item.get('size') else None,
                modified_time=item.get('modifiedTime', ''),
                modified_by=item.get('lastModifyingUser', {}).get('displayName'),
                is_folder=is_folder,
                parent_id=item.get('parents', [None])[0],
                web_view_link=item.get('webViewLink'),
                thumbnail_link=item.get('thumbnailLink'),
            )

        except Exception as e:
            logger.error(f"Error moving file: {e}")
            raise

    async def delete_file(self, file_id: str) -> bool:
        """
        Delete a file or folder (move to trash).

        Args:
            file_id: The file ID

        Returns:
            True if successful
        """
        service = self._get_service()

        try:
            # Move to trash instead of permanent delete
            service.files().update(
                fileId=file_id,
                body={'trashed': True},
                supportsAllDrives=True
            ).execute()
            return True

        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            raise

    async def get_breadcrumbs(self, drive_id: str, folder_id: Optional[str]) -> list[dict]:
        """
        Get breadcrumb path for a folder.

        Args:
            drive_id: The shared drive ID
            folder_id: The current folder ID (None for root)

        Returns:
            List of breadcrumb items from root to current folder
        """
        if not folder_id or folder_id == drive_id:
            return []

        service = self._get_service()
        breadcrumbs = []

        try:
            current_id = folder_id
            while current_id and current_id != drive_id:
                item = service.files().get(
                    fileId=current_id,
                    supportsAllDrives=True,
                    fields="id, name, parents"
                ).execute()

                breadcrumbs.insert(0, {
                    'id': item['id'],
                    'name': item['name']
                })

                parents = item.get('parents', [])
                current_id = parents[0] if parents else None

            return breadcrumbs

        except Exception as e:
            logger.error(f"Error getting breadcrumbs: {e}")
            return breadcrumbs


# Singleton instance
_drive_service: Optional[GoogleDriveService] = None


def get_drive_service() -> GoogleDriveService:
    """Get the Google Drive service instance."""
    global _drive_service
    if _drive_service is None:
        _drive_service = GoogleDriveService()
    return _drive_service
