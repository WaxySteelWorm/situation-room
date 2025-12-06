"""Credential models for Password Manager."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class CredentialType(str, Enum):
    PASSWORD = "password"
    SSH_KEY = "ssh_key"
    API_TOKEN = "api_token"
    CERTIFICATE = "certificate"


class UserVault(Base):
    """
    User vault stores the encrypted master password verification.
    This is used to verify the user's master password without storing it.
    """

    __tablename__ = "user_vaults"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # Encrypted verification token (encrypted with derived key from master password)
    # Used to verify the master password is correct
    verification_token: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # Salt used for key derivation
    key_salt: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class Credential(Base):
    """Encrypted credential storage."""

    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    credential_type: Mapped[str] = mapped_column(
        String(50), default=CredentialType.PASSWORD.value, nullable=False
    )

    # Encrypted value (encrypted with user's derived key from master password)
    encrypted_value: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # Initialization vector for encryption
    iv: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # Optional encrypted notes
    encrypted_notes: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    notes_iv: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)

    # Metadata (not encrypted)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
