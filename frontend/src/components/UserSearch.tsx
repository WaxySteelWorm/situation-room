import { useState, useEffect, useRef } from 'react';
import { usersApi, type UserProfile } from '../services/api';
import { User, X } from 'lucide-react';

interface UserSearchProps {
  value: string;
  onChange: (value: string, user?: UserProfile) => void;
  placeholder?: string;
  className?: string;
}

export default function UserSearch({
  value,
  onChange,
  placeholder = 'Search users...',
  className = '',
}: UserSearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<UserProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search users when query changes
  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    const searchUsers = async () => {
      setIsLoading(true);
      try {
        const users = await usersApi.search(query, 5);
        setResults(users);
        setIsOpen(true);
      } catch (error) {
        console.error('Failed to search users:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(searchUsers, 200);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelect = (user: UserProfile) => {
    setSelectedUser(user);
    setQuery(user.name);
    onChange(user.email, user);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedUser(null);
    setQuery('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setSelectedUser(null);
    if (!newValue) {
      onChange('');
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => query && results.length > 0 && setIsOpen(true)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          placeholder={placeholder}
        />
        <User
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        {(selectedUser || query) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (results.length > 0 || isLoading) && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="px-3 py-2 text-gray-400 text-sm">Searching...</div>
          ) : (
            results.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-700 transition-colors text-left"
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{user.name}</div>
                  <div className="text-gray-500 text-xs truncate">{user.email}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {isOpen && !isLoading && results.length === 0 && query.length >= 1 && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-3 text-gray-400 text-sm">
          No users found
        </div>
      )}
    </div>
  );
}
