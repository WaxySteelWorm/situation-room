"""Credential service for Password Manager with encryption."""

import os
import secrets
import string
from typing import Optional
from dataclasses import dataclass

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_config
from ..models.credential import Credential, UserVault, CredentialType


# Verification token plaintext (constant for all users)
VERIFICATION_PLAINTEXT = b"SITUATION_ROOM_VAULT_VERIFICATION_TOKEN_V1"


@dataclass
class DecryptedCredential:
    """Decrypted credential data."""

    id: int
    name: str
    credential_type: str
    value: str
    notes: Optional[str]
    username: Optional[str]
    url: Optional[str]
    created_at: str
    updated_at: str


class CredentialService:
    """Service for managing encrypted credentials."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _derive_key(self, master_password: str, salt: bytes) -> bytes:
        """Derive an encryption key from the master password."""
        config = get_config()
        app_salt = config.encryption.salt.encode("utf-8")

        # Combine user salt with app salt
        combined_salt = salt + app_salt

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # 256-bit key for AES-256
            salt=combined_salt,
            iterations=480000,  # OWASP recommended minimum
        )

        return kdf.derive(master_password.encode("utf-8"))

    def _encrypt(self, plaintext: bytes, key: bytes) -> tuple[bytes, bytes]:
        """Encrypt data using AES-GCM."""
        iv = os.urandom(12)  # 96-bit nonce for AES-GCM
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(iv, plaintext, None)
        return ciphertext, iv

    def _decrypt(self, ciphertext: bytes, key: bytes, iv: bytes) -> bytes:
        """Decrypt data using AES-GCM."""
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(iv, ciphertext, None)

    async def has_vault(self, username: str) -> bool:
        """Check if a user has set up their vault (master password)."""
        result = await self.db.execute(
            select(UserVault).where(UserVault.username == username)
        )
        return result.scalar_one_or_none() is not None

    async def setup_vault(self, username: str, master_password: str) -> bytes:
        """
        Set up a new vault for a user with their master password.
        Returns the derived key for use in the session.
        """
        # Generate random salt for this user
        salt = os.urandom(32)

        # Derive key from master password
        key = self._derive_key(master_password, salt)

        # Encrypt verification token using first 12 bytes of salt as IV
        # This ensures we can decrypt it later with the same IV
        iv = salt[:12]
        aesgcm = AESGCM(key)
        verification_token = aesgcm.encrypt(iv, VERIFICATION_PLAINTEXT, None)

        # Store vault
        vault = UserVault(
            username=username,
            verification_token=verification_token,
            key_salt=salt,
        )
        self.db.add(vault)
        await self.db.flush()

        return key

    async def unlock_vault(self, username: str, master_password: str) -> Optional[bytes]:
        """
        Unlock a user's vault by verifying their master password.
        Returns the derived key if successful, None otherwise.
        """
        result = await self.db.execute(
            select(UserVault).where(UserVault.username == username)
        )
        vault = result.scalar_one_or_none()

        if vault is None:
            return None

        # Derive key from master password
        key = self._derive_key(master_password, vault.key_salt)

        # Try to decrypt verification token
        try:
            # For AES-GCM, we need to use a consistent IV for verification
            # The verification token includes the IV
            decrypted = self._decrypt(
                vault.verification_token,
                key,
                vault.key_salt[:12],  # Use first 12 bytes of salt as IV for verification
            )

            if decrypted == VERIFICATION_PLAINTEXT:
                return key
        except Exception:
            pass

        return None

    async def get_credentials(
        self, username: str, vault_key: bytes
    ) -> list[DecryptedCredential]:
        """Get all credentials for a user (decrypted)."""
        result = await self.db.execute(
            select(Credential).where(Credential.owner == username)
        )
        credentials = result.scalars().all()

        decrypted_creds = []
        for cred in credentials:
            try:
                value = self._decrypt(cred.encrypted_value, vault_key, cred.iv).decode(
                    "utf-8"
                )

                notes = None
                if cred.encrypted_notes and cred.notes_iv:
                    notes = self._decrypt(
                        cred.encrypted_notes, vault_key, cred.notes_iv
                    ).decode("utf-8")

                decrypted_creds.append(
                    DecryptedCredential(
                        id=cred.id,
                        name=cred.name,
                        credential_type=cred.credential_type,
                        value=value,
                        notes=notes,
                        username=cred.username,
                        url=cred.url,
                        created_at=cred.created_at.isoformat(),
                        updated_at=cred.updated_at.isoformat(),
                    )
                )
            except Exception:
                # Skip credentials that can't be decrypted
                continue

        return decrypted_creds

    async def get_credential(
        self, credential_id: int, username: str, vault_key: bytes
    ) -> Optional[DecryptedCredential]:
        """Get a single credential by ID."""
        result = await self.db.execute(
            select(Credential).where(
                Credential.id == credential_id, Credential.owner == username
            )
        )
        cred = result.scalar_one_or_none()

        if cred is None:
            return None

        try:
            value = self._decrypt(cred.encrypted_value, vault_key, cred.iv).decode(
                "utf-8"
            )

            notes = None
            if cred.encrypted_notes and cred.notes_iv:
                notes = self._decrypt(
                    cred.encrypted_notes, vault_key, cred.notes_iv
                ).decode("utf-8")

            return DecryptedCredential(
                id=cred.id,
                name=cred.name,
                credential_type=cred.credential_type,
                value=value,
                notes=notes,
                username=cred.username,
                url=cred.url,
                created_at=cred.created_at.isoformat(),
                updated_at=cred.updated_at.isoformat(),
            )
        except Exception:
            return None

    async def create_credential(
        self,
        username: str,
        vault_key: bytes,
        name: str,
        value: str,
        credential_type: str = CredentialType.PASSWORD.value,
        notes: Optional[str] = None,
        cred_username: Optional[str] = None,
        url: Optional[str] = None,
    ) -> DecryptedCredential:
        """Create a new encrypted credential."""
        # Encrypt value
        encrypted_value, iv = self._encrypt(value.encode("utf-8"), vault_key)

        # Encrypt notes if provided
        encrypted_notes = None
        notes_iv = None
        if notes:
            encrypted_notes, notes_iv = self._encrypt(notes.encode("utf-8"), vault_key)

        cred = Credential(
            owner=username,
            name=name,
            credential_type=credential_type,
            encrypted_value=encrypted_value,
            iv=iv,
            encrypted_notes=encrypted_notes,
            notes_iv=notes_iv,
            username=cred_username,
            url=url,
        )

        self.db.add(cred)
        await self.db.flush()

        return DecryptedCredential(
            id=cred.id,
            name=name,
            credential_type=credential_type,
            value=value,
            notes=notes,
            username=cred_username,
            url=url,
            created_at=cred.created_at.isoformat(),
            updated_at=cred.updated_at.isoformat(),
        )

    async def update_credential(
        self,
        credential_id: int,
        username: str,
        vault_key: bytes,
        name: Optional[str] = None,
        value: Optional[str] = None,
        credential_type: Optional[str] = None,
        notes: Optional[str] = None,
        cred_username: Optional[str] = None,
        url: Optional[str] = None,
    ) -> Optional[DecryptedCredential]:
        """Update an existing credential."""
        result = await self.db.execute(
            select(Credential).where(
                Credential.id == credential_id, Credential.owner == username
            )
        )
        cred = result.scalar_one_or_none()

        if cred is None:
            return None

        if name is not None:
            cred.name = name
        if credential_type is not None:
            cred.credential_type = credential_type
        if cred_username is not None:
            cred.username = cred_username
        if url is not None:
            cred.url = url

        if value is not None:
            encrypted_value, iv = self._encrypt(value.encode("utf-8"), vault_key)
            cred.encrypted_value = encrypted_value
            cred.iv = iv

        if notes is not None:
            if notes:
                encrypted_notes, notes_iv = self._encrypt(
                    notes.encode("utf-8"), vault_key
                )
                cred.encrypted_notes = encrypted_notes
                cred.notes_iv = notes_iv
            else:
                cred.encrypted_notes = None
                cred.notes_iv = None

        await self.db.flush()

        return await self.get_credential(credential_id, username, vault_key)

    async def delete_credential(
        self, credential_id: int, username: str
    ) -> bool:
        """Delete a credential."""
        result = await self.db.execute(
            select(Credential).where(
                Credential.id == credential_id, Credential.owner == username
            )
        )
        cred = result.scalar_one_or_none()

        if cred is None:
            return False

        await self.db.delete(cred)
        await self.db.flush()
        return True

    @staticmethod
    def generate_password(
        length: int = 20,
        uppercase: bool = True,
        lowercase: bool = True,
        numbers: bool = True,
        symbols: bool = True,
    ) -> str:
        """Generate a random password with specified complexity."""
        chars = ""

        if uppercase:
            chars += string.ascii_uppercase
        if lowercase:
            chars += string.ascii_lowercase
        if numbers:
            chars += string.digits
        if symbols:
            chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"

        if not chars:
            chars = string.ascii_letters + string.digits

        # Ensure at least one character from each selected category
        password = []
        if uppercase:
            password.append(secrets.choice(string.ascii_uppercase))
        if lowercase:
            password.append(secrets.choice(string.ascii_lowercase))
        if numbers:
            password.append(secrets.choice(string.digits))
        if symbols:
            password.append(secrets.choice("!@#$%^&*()_+-=[]{}|;:,.<>?"))

        # Fill remaining length
        remaining = length - len(password)
        password.extend(secrets.choice(chars) for _ in range(remaining))

        # Shuffle
        password_list = list(password)
        secrets.SystemRandom().shuffle(password_list)

        return "".join(password_list)
