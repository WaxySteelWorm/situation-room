# Situation Room

An internal web dashboard for small teams (< 5 users) managing privacy-focused services. Features task tracking with a Kanban board, secure password management, and a clean dark-mode interface.

## Features

### Task Tracking (Kanban Board)
- Customizable columns (add, edit, delete, reorder)
- Drag-and-drop tasks between columns
- Task properties: title, description, assignee, due date, priority, labels, comments
- Recurring tasks with daily, weekly, or monthly intervals
- Tasks are archived, never deleted
- Notifications via email and Discord webhook

### Password Manager
- Per-user master password (entered after login)
- Credentials encrypted at rest using AES-256-GCM
- Supports: passwords, SSH keys, API tokens, certificates
- Click-to-reveal with copy-to-clipboard (auto-clears after 15 seconds)
- Built-in password generator

### Documents/Wiki
- Internal documentation and notes
- Hierarchical document structure (parent/child documents)
- Full-text search
- Pin important documents
- Markdown content support

### Dashboard
- Summary view with task statistics
- Tasks due soon
- Placeholder sections for system health (v2) and Ansible jobs (v2)

## Prerequisites

- Docker and Docker Compose
- A domain name (for HTTPS with Let's Encrypt)

## Quick Start

### 1. Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd situation-room

# Copy the example configuration
cp config.example.yml config.yml
```

### 2. Edit Configuration

Edit `config.yml` with your settings:

```yaml
# Update these essential settings:
server:
  host: "0.0.0.0"
  port: 8000

https:
  enabled: true
  domain: "your-domain.com"
  email: "admin@your-domain.com"

# Configure your users (passwords are bcrypt hashed)
users:
  - username: "admin"
    email: "admin@example.com"
    password_hash: "$2b$12$..."  # See below for generating hashes
    role: "admin"

# Optional: Discord webhook for notifications
discord:
  enabled: true
  webhook_url: "https://discord.com/api/webhooks/..."

# Optional: SMTP for email notifications
smtp:
  enabled: true
  host: "smtp.example.com"
  port: 587
  username: "user"
  password: "password"  # Or set via SITUATION_ROOM_SMTP_PASSWORD env var
  from_email: "noreply@example.com"
```

### 3. Generate Password Hashes

Generate bcrypt password hashes for your users:

```bash
# Using Python
python -c "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"

# Or using Docker
docker run --rm python:3.12-slim python -c "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"
```

### 4. Start the Application

```bash
docker-compose up -d
```

The application will be available at `http://localhost:8000`.

### 5. Enable HTTPS (Production)

For production with automatic HTTPS via Let's Encrypt:

1. Edit `Caddyfile` and replace `situation-room.example.com` with your domain
2. Uncomment the Caddy service in `docker-compose.yml`
3. Restart:

```bash
docker-compose down
docker-compose up -d
```

## Environment Variables

All secrets can be overridden via environment variables (recommended for production):

| Variable | Description |
|----------|-------------|
| `SITUATION_ROOM_CONFIG` | Path to config file (default: `/app/config.yml`) |
| `SITUATION_ROOM_SESSION_SECRET` | Session signing key |
| `SITUATION_ROOM_ENCRYPTION_SALT` | Additional salt for credential encryption |
| `SITUATION_ROOM_DB_PATH` | SQLite database path |
| `SITUATION_ROOM_LOG_LEVEL` | Logging level (debug, info, warning, error) |
| `SITUATION_ROOM_DISCORD_WEBHOOK` | Discord webhook URL |
| `SITUATION_ROOM_SMTP_HOST` | SMTP server host |
| `SITUATION_ROOM_SMTP_PASSWORD` | SMTP password |

Example with environment variables:

```bash
docker-compose up -d \
  -e SITUATION_ROOM_SESSION_SECRET="your-secure-secret" \
  -e SITUATION_ROOM_ENCRYPTION_SALT="32-character-salt-here"
```

## Default Credentials

The example configuration includes a default admin user:

- **Username:** `admin`
- **Password:** `admin123`

**Important:** Change this password before deploying to production!

## Architecture

```
situation-room/
├── docker-compose.yml    # Docker orchestration
├── Dockerfile            # Multi-stage build (frontend + backend)
├── Caddyfile            # Caddy reverse proxy config (optional)
├── config.example.yml   # Example configuration
├── config.yml           # Your configuration (not in git)
├── backend/
│   ├── requirements.txt # Python dependencies
│   └── app/
│       ├── main.py      # FastAPI application
│       ├── config.py    # Configuration loader
│       ├── models/      # SQLAlchemy models
│       ├── services/    # Business logic
│       ├── routers/     # API routes
│       └── utils/       # Utilities
└── frontend/
    ├── package.json     # Node dependencies
    └── src/
        ├── App.tsx      # React application
        ├── pages/       # Page components
        ├── components/  # Reusable components
        ├── hooks/       # Custom React hooks
        ├── services/    # API client
        └── types/       # TypeScript types
```

## Security Notes

- Sessions are stored in-memory (users must re-login after app restart)
- Sessions expire after 15 minutes of inactivity
- Credentials are encrypted using AES-256-GCM with keys derived from user master passwords
- Master passwords are never stored - only a verification token
- All sensitive values should be set via environment variables in production

## SSO/OIDC Configuration

Situation Room supports Single Sign-On (SSO) via OpenID Connect (OIDC). This works with providers like Authentik, Keycloak, Okta, Auth0, and Google.

### Basic SSO Setup

Add the SSO configuration to your `config.yml`:

```yaml
sso:
  enabled: true
  allow_password_login: true  # Keep password login as fallback
  auto_create_users: false    # Set true to auto-create users on first login
  default_role: "user"        # Role for auto-created users
  allowed_domains: []         # Restrict to specific email domains (empty = all)

  providers:
    - name: "Authentik"
      client_id: "your-client-id"
      client_secret: "your-client-secret"
      discovery_url: "https://auth.example.com/application/o/situation-room/.well-known/openid-configuration"
```

### Provider Configuration Examples

#### Authentik

1. Create an OAuth2/OpenID Provider in Authentik
2. Set the redirect URI to: `https://your-domain.com/api/auth/sso/authentik/callback`
3. Copy the client ID and secret to your config

```yaml
providers:
  - name: "Authentik"
    client_id: "your-client-id"
    client_secret: "your-client-secret"
    discovery_url: "https://auth.example.com/application/o/situation-room/.well-known/openid-configuration"
```

#### Keycloak

1. Create a new client in your Keycloak realm
2. Set Access Type to "confidential"
3. Add the redirect URI: `https://your-domain.com/api/auth/sso/keycloak/callback`

```yaml
providers:
  - name: "Keycloak"
    client_id: "situation-room"
    client_secret: "your-client-secret"
    discovery_url: "https://keycloak.example.com/realms/your-realm/.well-known/openid-configuration"
```

#### Google

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create an OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-domain.com/api/auth/sso/google/callback`

```yaml
providers:
  - name: "Google"
    client_id: "your-client-id.apps.googleusercontent.com"
    client_secret: "your-client-secret"
    discovery_url: "https://accounts.google.com/.well-known/openid-configuration"
```

### Manual Provider Configuration

If your provider doesn't support OIDC discovery, you can configure endpoints manually:

```yaml
providers:
  - name: "Custom Provider"
    client_id: "your-client-id"
    client_secret: "your-client-secret"
    authorization_url: "https://auth.example.com/authorize"
    token_url: "https://auth.example.com/token"
    userinfo_url: "https://auth.example.com/userinfo"
    scopes:
      - openid
      - email
      - profile
    email_claim: "email"      # Claim containing user email
    name_claim: "name"        # Claim containing user name
```

### User Mapping

SSO users are matched by email address:

- **Existing users**: If a user with the same email exists in `config.yml`, they will be logged in with that user's role
- **Auto-create users**: If `auto_create_users: true`, new users will be created with the `default_role`
- **Domain restriction**: Use `allowed_domains` to restrict which email domains can log in

### Multiple Providers

You can configure multiple SSO providers:

```yaml
sso:
  enabled: true
  providers:
    - name: "Corporate SSO"
      client_id: "..."
      discovery_url: "..."
    - name: "Google"
      client_id: "..."
      discovery_url: "..."
```

Each provider will appear as a separate button on the login page

## Development

### Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

### Build Frontend Only

```bash
cd frontend
npm run build
# Output goes to ../backend/app/static/
```

## API Documentation

When running in debug mode, API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Future Features (v2)

- System monitoring with Prometheus integration
- Remote agents with WebSocket push
- Ansible job triggering via SSH
- Agent management

## License

Private - Internal use only
