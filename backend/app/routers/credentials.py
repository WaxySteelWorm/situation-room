"""Credentials/Password Manager API routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models.credential import CredentialType
from ..services.credential import CredentialService
from ..services.auth import get_auth_service, Session
from .auth import get_current_session


router = APIRouter(prefix="/api/credentials", tags=["credentials"])


class SetupVaultRequest(BaseModel):
    master_password: str


class UnlockVaultRequest(BaseModel):
    master_password: str


class CredentialSchema(BaseModel):
    id: int
    name: str
    credential_type: str
    value: str
    notes: Optional[str] = None
    username: Optional[str] = None
    url: Optional[str] = None
    created_at: str
    updated_at: str


class CreateCredentialRequest(BaseModel):
    name: str
    value: str
    credential_type: str = CredentialType.PASSWORD.value
    notes: Optional[str] = None
    username: Optional[str] = None
    url: Optional[str] = None


class UpdateCredentialRequest(BaseModel):
    name: Optional[str] = None
    value: Optional[str] = None
    credential_type: Optional[str] = None
    notes: Optional[str] = None
    username: Optional[str] = None
    url: Optional[str] = None


class GeneratePasswordRequest(BaseModel):
    length: int = 20
    uppercase: bool = True
    lowercase: bool = True
    numbers: bool = True
    symbols: bool = True


class GeneratePasswordResponse(BaseModel):
    password: str


async def require_unlocked_vault(
    session: Session = Depends(get_current_session),
) -> Session:
    """Dependency that requires the vault to be unlocked."""
    if session.vault_key is None:
        raise HTTPException(
            status_code=403,
            detail="Vault is locked. Please unlock your vault first.",
        )
    return session


@router.get("/vault/status")
async def get_vault_status(
    session: Session = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
):
    """Check if the user's vault is set up and/or unlocked."""
    credential_service = CredentialService(db)
    has_vault = await credential_service.has_vault(session.username)

    return {
        "has_vault": has_vault,
        "is_unlocked": session.vault_key is not None,
    }


@router.post("/vault/setup")
async def setup_vault(
    request: SetupVaultRequest,
    session: Session = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
):
    """Set up a new vault with a master password."""
    credential_service = CredentialService(db)

    # Check if vault already exists
    if await credential_service.has_vault(session.username):
        raise HTTPException(
            status_code=400,
            detail="Vault already exists. Use unlock endpoint instead.",
        )

    # Validate master password strength
    if len(request.master_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Master password must be at least 8 characters.",
        )

    # Setup vault and get derived key
    vault_key = await credential_service.setup_vault(
        session.username, request.master_password
    )

    # Store key in session
    auth_service = get_auth_service()
    auth_service.set_vault_key(session.session_id, vault_key)

    return {"message": "Vault created and unlocked successfully"}


@router.post("/vault/unlock")
async def unlock_vault(
    request: UnlockVaultRequest,
    session: Session = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
):
    """Unlock the vault with the master password."""
    credential_service = CredentialService(db)

    # Check if vault exists
    if not await credential_service.has_vault(session.username):
        raise HTTPException(
            status_code=400,
            detail="No vault exists. Please set up your vault first.",
        )

    # Try to unlock
    vault_key = await credential_service.unlock_vault(
        session.username, request.master_password
    )

    if vault_key is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid master password.",
        )

    # Store key in session
    auth_service = get_auth_service()
    auth_service.set_vault_key(session.session_id, vault_key)

    return {"message": "Vault unlocked successfully"}


@router.post("/vault/lock")
async def lock_vault(session: Session = Depends(get_current_session)):
    """Lock the vault (clear the encryption key from memory)."""
    auth_service = get_auth_service()
    auth_service.clear_vault_key(session.session_id)

    return {"message": "Vault locked"}


@router.get("", response_model=list[CredentialSchema])
async def get_credentials(
    session: Session = Depends(require_unlocked_vault),
    db: AsyncSession = Depends(get_db),
):
    """Get all credentials (vault must be unlocked)."""
    credential_service = CredentialService(db)
    credentials = await credential_service.get_credentials(
        session.username, session.vault_key
    )

    return [
        CredentialSchema(
            id=c.id,
            name=c.name,
            credential_type=c.credential_type,
            value=c.value,
            notes=c.notes,
            username=c.username,
            url=c.url,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in credentials
    ]


@router.get("/{credential_id}", response_model=CredentialSchema)
async def get_credential(
    credential_id: int,
    session: Session = Depends(require_unlocked_vault),
    db: AsyncSession = Depends(get_db),
):
    """Get a single credential by ID."""
    credential_service = CredentialService(db)
    credential = await credential_service.get_credential(
        credential_id, session.username, session.vault_key
    )

    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    return CredentialSchema(
        id=credential.id,
        name=credential.name,
        credential_type=credential.credential_type,
        value=credential.value,
        notes=credential.notes,
        username=credential.username,
        url=credential.url,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


@router.post("", response_model=CredentialSchema)
async def create_credential(
    request: CreateCredentialRequest,
    session: Session = Depends(require_unlocked_vault),
    db: AsyncSession = Depends(get_db),
):
    """Create a new credential."""
    # Validate credential type
    try:
        CredentialType(request.credential_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid credential type. Must be one of: {[t.value for t in CredentialType]}",
        )

    credential_service = CredentialService(db)
    credential = await credential_service.create_credential(
        username=session.username,
        vault_key=session.vault_key,
        name=request.name,
        value=request.value,
        credential_type=request.credential_type,
        notes=request.notes,
        cred_username=request.username,
        url=request.url,
    )

    return CredentialSchema(
        id=credential.id,
        name=credential.name,
        credential_type=credential.credential_type,
        value=credential.value,
        notes=credential.notes,
        username=credential.username,
        url=credential.url,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


@router.put("/{credential_id}", response_model=CredentialSchema)
async def update_credential(
    credential_id: int,
    request: UpdateCredentialRequest,
    session: Session = Depends(require_unlocked_vault),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing credential."""
    # Validate credential type if provided
    if request.credential_type:
        try:
            CredentialType(request.credential_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid credential type. Must be one of: {[t.value for t in CredentialType]}",
            )

    credential_service = CredentialService(db)
    credential = await credential_service.update_credential(
        credential_id=credential_id,
        username=session.username,
        vault_key=session.vault_key,
        name=request.name,
        value=request.value,
        credential_type=request.credential_type,
        notes=request.notes,
        cred_username=request.username,
        url=request.url,
    )

    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    return CredentialSchema(
        id=credential.id,
        name=credential.name,
        credential_type=credential.credential_type,
        value=credential.value,
        notes=credential.notes,
        username=credential.username,
        url=credential.url,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


@router.delete("/{credential_id}")
async def delete_credential(
    credential_id: int,
    session: Session = Depends(require_unlocked_vault),
    db: AsyncSession = Depends(get_db),
):
    """Delete a credential."""
    credential_service = CredentialService(db)
    success = await credential_service.delete_credential(
        credential_id, session.username
    )

    if not success:
        raise HTTPException(status_code=404, detail="Credential not found")

    return {"message": "Credential deleted"}


@router.post("/generate-password", response_model=GeneratePasswordResponse)
async def generate_password(
    request: GeneratePasswordRequest,
    session: Session = Depends(get_current_session),
):
    """Generate a random password."""
    if request.length < 8:
        raise HTTPException(
            status_code=400,
            detail="Password length must be at least 8 characters.",
        )

    if request.length > 128:
        raise HTTPException(
            status_code=400,
            detail="Password length must be at most 128 characters.",
        )

    password = CredentialService.generate_password(
        length=request.length,
        uppercase=request.uppercase,
        lowercase=request.lowercase,
        numbers=request.numbers,
        symbols=request.symbols,
    )

    return GeneratePasswordResponse(password=password)
