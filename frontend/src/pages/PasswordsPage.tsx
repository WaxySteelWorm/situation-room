import { useState, useEffect, useCallback } from 'react';
import { credentialsApi } from '../services/api';
import type { Credential, VaultStatus } from '../types';
import {
  Lock,
  Unlock,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Check,
  Key,
  Terminal,
  FileKey,
  Shield,
  RefreshCw,
  Trash2,
  Edit2,
} from 'lucide-react';

const typeIcons: Record<string, typeof Key> = {
  password: Key,
  ssh_key: Terminal,
  api_token: FileKey,
  certificate: Shield,
};

const typeLabels: Record<string, string> = {
  password: 'Password',
  ssh_key: 'SSH Key',
  api_token: 'API Token',
  certificate: 'Certificate',
};

export default function PasswordsPage() {
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(
    null
  );

  const loadVaultStatus = useCallback(async () => {
    try {
      const status = await credentialsApi.getVaultStatus();
      setVaultStatus(status);
      return status;
    } catch {
      setError('Failed to check vault status');
      return null;
    }
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      const creds = await credentialsApi.getAll();
      setCredentials(creds);
    } catch {
      // Vault might be locked
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const status = await loadVaultStatus();
      if (status?.is_unlocked) {
        await loadCredentials();
      }
      setIsLoading(false);
    };
    init();
  }, [loadVaultStatus, loadCredentials]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (!vaultStatus?.has_vault) {
        await credentialsApi.setupVault(masterPassword);
      } else {
        await credentialsApi.unlockVault(masterPassword);
      }
      setMasterPassword('');
      await loadVaultStatus();
      await loadCredentials();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to unlock vault';
      setError(message);
    }
  };

  const handleLock = async () => {
    try {
      await credentialsApi.lockVault();
      setCredentials([]);
      await loadVaultStatus();
    } catch {
      setError('Failed to lock vault');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this credential?')) return;
    try {
      await credentialsApi.delete(id);
      await loadCredentials();
    } catch {
      setError('Failed to delete credential');
    }
  };

  const filteredCredentials = credentials.filter(
    (cred) =>
      cred.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.url?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!vaultStatus?.is_unlocked) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock size={32} className="text-gray-500" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                {vaultStatus?.has_vault ? 'Unlock Vault' : 'Setup Vault'}
              </h2>
              <p className="text-gray-500 text-sm">
                {vaultStatus?.has_vault
                  ? 'Enter your master password to access your credentials'
                  : 'Create a master password to secure your credentials'}
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Master Password
                </label>
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="Enter master password"
                  autoFocus
                  minLength={8}
                  required
                />
                {!vaultStatus?.has_vault && (
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 8 characters
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Unlock size={18} />
                {vaultStatus?.has_vault ? 'Unlock' : 'Create Vault'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Password Manager</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLock}
            className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Lock size={18} />
            Lock
          </button>
          <button
            onClick={() => {
              setEditingCredential(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            Add Credential
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          placeholder="Search credentials..."
        />
      </div>

      {/* Credentials List */}
      {filteredCredentials.length === 0 ? (
        <div className="text-center py-12">
          <Key size={48} className="mx-auto text-gray-700 mb-4" />
          <p className="text-gray-500">
            {searchQuery ? 'No credentials found' : 'No credentials yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCredentials.map((credential) => (
            <CredentialCard
              key={credential.id}
              credential={credential}
              onEdit={() => {
                setEditingCredential(credential);
                setIsModalOpen(true);
              }}
              onDelete={() => handleDelete(credential.id)}
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <CredentialModal
          credential={editingCredential}
          onClose={() => {
            setIsModalOpen(false);
            setEditingCredential(null);
          }}
          onSaved={() => {
            setIsModalOpen(false);
            setEditingCredential(null);
            loadCredentials();
          }}
        />
      )}
    </div>
  );
}

function CredentialCard({
  credential,
  onEdit,
  onDelete,
}: {
  credential: Credential;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = typeIcons[credential.credential_type] || Key;

  const handleCopy = async () => {
    try {
      // Try modern clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(credential.value);
      } else {
        // Fallback for HTTP: use deprecated execCommand
        const textArea = document.createElement('textarea');
        textArea.value = credential.value;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);

      // Auto-clear clipboard after 15 seconds (only works with secure context)
      if (navigator.clipboard && window.isSecureContext) {
        setTimeout(async () => {
          try {
            const current = await navigator.clipboard.readText();
            if (current === credential.value) {
              await navigator.clipboard.writeText('');
            }
          } catch {
            // Clipboard access denied
          }
        }, 15000);
      }

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-gray-800 rounded-lg">
          <Icon size={20} className="text-blue-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white truncate">{credential.name}</h3>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {typeLabels[credential.credential_type]}
            </span>
          </div>

          {credential.username && (
            <p className="text-sm text-gray-500 truncate">{credential.username}</p>
          )}
          {credential.url && (
            <p className="text-sm text-gray-600 truncate">{credential.url}</p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 font-mono text-sm bg-gray-800 rounded px-3 py-1.5 overflow-hidden">
              {isRevealed ? (
                <span className="text-white break-all">{credential.value}</span>
              ) : (
                <span className="text-gray-500">{'•'.repeat(16)}</span>
              )}
            </div>
            <button
              onClick={() => setIsRevealed(!isRevealed)}
              className="p-2 text-gray-500 hover:text-white transition-colors"
              title={isRevealed ? 'Hide' : 'Reveal'}
            >
              {isRevealed ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button
              onClick={handleCopy}
              className="p-2 text-gray-500 hover:text-white transition-colors"
              title="Copy (auto-clears in 15s)"
            >
              {copied ? (
                <Check size={18} className="text-green-400" />
              ) : (
                <Copy size={18} />
              )}
            </button>
          </div>

          {credential.notes && (
            <p className="mt-2 text-sm text-gray-500 line-clamp-2">
              {credential.notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-white transition-colors"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CredentialModal({
  credential,
  onClose,
  onSaved,
}: {
  credential: Credential | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(credential?.name || '');
  const [credentialType, setCredentialType] = useState<string>(
    credential?.credential_type || 'password'
  );
  const [value, setValue] = useState(credential?.value || '');
  const [username, setUsername] = useState(credential?.username || '');
  const [url, setUrl] = useState(credential?.url || '');
  const [notes, setNotes] = useState(credential?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGeneratePassword = async () => {
    try {
      const { password } = await credentialsApi.generatePassword({
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });
      setValue(password);
    } catch {
      setError('Failed to generate password');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim()) {
      setError('Name and value are required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (credential) {
        await credentialsApi.update(credential.id, {
          name: name.trim(),
          credential_type: credentialType,
          value: value.trim(),
          username: username.trim() || undefined,
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await credentialsApi.create({
          name: name.trim(),
          credential_type: credentialType,
          value: value.trim(),
          username: username.trim() || undefined,
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      onSaved();
    } catch {
      setError('Failed to save credential');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-lg">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {credential ? 'Edit Credential' : 'Add Credential'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g., GitHub Account"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Type
            </label>
            <select
              value={credentialType}
              onChange={(e) => setCredentialType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="password">Password</option>
              <option value="ssh_key">SSH Key</option>
              <option value="api_token">API Token</option>
              <option value="certificate">Certificate</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Value *
            </label>
            <div className="flex gap-2">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={credentialType === 'ssh_key' ? 6 : 2}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                placeholder={
                  credentialType === 'ssh_key'
                    ? '-----BEGIN OPENSSH PRIVATE KEY-----'
                    : 'Enter value...'
                }
              />
              {credentialType === 'password' && (
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="px-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                  title="Generate Password"
                >
                  <RefreshCw size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
