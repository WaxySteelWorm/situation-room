import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi, ApiError } from '../services/api';
import { Lock, User, ExternalLink } from 'lucide-react';

interface AuthConfig {
  sso_enabled: boolean;
  allow_password_login: boolean;
  providers: Array<{ name: string; id: string }>;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    // Load auth configuration
    authApi.getConfig().then(setAuthConfig).catch(console.error);

    // Check for SSO error in URL
    const ssoError = searchParams.get('error');
    if (ssoError) {
      const errorMessages: Record<string, string> = {
        invalid_callback: 'Invalid authentication callback',
        invalid_state: 'Authentication session expired. Please try again.',
        authentication_failed: 'Authentication failed. Please try again.',
        user_not_authorized: 'Your account is not authorized to access this application.',
        session_creation_failed: 'Failed to create session. Please try again.',
      };
      setError(errorMessages[ssoError] || `Authentication error: ${ssoError}`);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSsoLogin = (providerId: string) => {
    // Redirect to SSO authorization endpoint
    window.location.href = authApi.getSsoAuthorizeUrl(providerId);
  };

  const showPasswordLogin = !authConfig?.sso_enabled || authConfig?.allow_password_login;
  const showSsoProviders = authConfig?.sso_enabled && authConfig.providers.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-blue-400 mb-2">
              Situation Room
            </h1>
            <p className="text-gray-500">Sign in to your account</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {/* SSO Providers */}
          {showSsoProviders && (
            <div className="space-y-3 mb-6">
              {authConfig?.providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleSsoLogin(provider.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors"
                >
                  <ExternalLink size={18} />
                  Sign in with {provider.name}
                </button>
              ))}
            </div>
          )}

          {/* Divider */}
          {showSsoProviders && showPasswordLogin && (
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-500">
                  or continue with password
                </span>
              </div>
            </div>
          )}

          {/* Password Login Form */}
          {showPasswordLogin && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-400 mb-2"
                >
                  Username
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter your username"
                    required
                    autoFocus={!showSsoProviders}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-400 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* SSO Only Message */}
          {!showPasswordLogin && !showSsoProviders && (
            <p className="text-center text-gray-500">
              No authentication methods configured. Please contact your administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
