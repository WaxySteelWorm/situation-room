# Situation Room Monitoring Agent

A lightweight Python agent that collects UFW firewall logs and runs health checks on Linux servers, pushing data to the Situation Room server via WebSocket.

## Features

- **UFW Log Collection**: Monitors `/var/log/ufw.log` for blocked connections
- **Health Checks**: Disk usage, memory, load average, network connectivity, and custom commands
- **Automatic Reconnection**: Exponential backoff on connection failures
- **Minimal Dependencies**: Only requires `websockets` and `pyyaml`
- **Systemd Integration**: Easy to run as a system service

## Requirements

- Python 3.8+
- Linux (for UFW logs and `/proc` filesystem)
- Read access to `/var/log/ufw.log`
- Network access to Situation Room server

## Installation

### 1. Install Dependencies

```bash
pip install websockets pyyaml
```

Or using a virtual environment:

```bash
python3 -m venv /opt/situation-room-agent/venv
source /opt/situation-room-agent/venv/bin/activate
pip install websockets pyyaml
```

### 2. Install the Agent

```bash
# Create directory
sudo mkdir -p /opt/situation-room-agent
sudo mkdir -p /etc/situation-room

# Copy agent script
sudo cp situation-room-agent.py /opt/situation-room-agent/
sudo chmod +x /opt/situation-room-agent/situation-room-agent.py

# Copy and configure settings
sudo cp agent-config.example.yml /etc/situation-room/agent.yml
sudo chmod 600 /etc/situation-room/agent.yml
sudo nano /etc/situation-room/agent.yml
```

### 3. Configure the Agent

Edit `/etc/situation-room/agent.yml`:

```yaml
server:
  url: wss://your-server.example.com/api/monitoring/ws/agent
  api_key: your-api-key-from-situation-room
  verify_ssl: true

agent:
  report_interval_seconds: 60

ufw:
  enabled: true
  log_path: /var/log/ufw.log

health_checks:
  enabled: true
  checks:
    - name: disk_root
      type: disk
      path: /
    - name: memory
      type: memory
    - name: load
      type: load
    - name: internet
      type: connectivity
      host: 8.8.8.8
      port: 53
```

### 4. Set Up Systemd Service

Create `/etc/systemd/system/situation-room-agent.service`:

```ini
[Unit]
Description=Situation Room Monitoring Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/opt/situation-room-agent/venv/bin/python /opt/situation-room-agent/situation-room-agent.py --config /etc/situation-room/agent.yml
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/
ReadWritePaths=/var/log

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable situation-room-agent
sudo systemctl start situation-room-agent
```

### 5. Verify Operation

Check service status:

```bash
sudo systemctl status situation-room-agent
```

View logs:

```bash
sudo journalctl -u situation-room-agent -f
```

## Configuration Reference

### Server Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `url` | WebSocket URL for Situation Room | Required |
| `api_key` | Authentication API key | Required |
| `verify_ssl` | Verify SSL certificate | `true` |

### Agent Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `hostname` | Agent hostname identifier | System hostname |
| `report_interval_seconds` | Seconds between reports | `60` |

### UFW Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable UFW log collection | `true` |
| `log_path` | Path to UFW log file | `/var/log/ufw.log` |

### Health Check Types

#### Disk Check
```yaml
- name: disk_root
  type: disk
  path: /
```

#### Memory Check
```yaml
- name: memory
  type: memory
```

#### Load Check
```yaml
- name: load
  type: load
```

#### Connectivity Check
```yaml
- name: internet
  type: connectivity
  host: 8.8.8.8
  port: 53
  timeout: 5.0
```

#### Custom Command
```yaml
- name: nginx
  type: custom
  command: systemctl is-active nginx
  timeout: 30.0
```

## Troubleshooting

### Agent won't connect

1. Check the server URL is correct
2. Verify the API key matches the server configuration
3. Check firewall rules allow outbound WebSocket connections
4. If using self-signed certs, set `verify_ssl: false`

### No UFW logs being sent

1. Ensure UFW is enabled and logging: `sudo ufw status verbose`
2. Check log file permissions: `ls -la /var/log/ufw.log`
3. Verify the agent has read access to the log file

### Permission denied errors

Run the agent as root or a user with appropriate permissions:
- Read access to `/var/log/ufw.log`
- Read access to `/proc/meminfo`
- Ability to run `os.statvfs()` and `os.getloadavg()`

## Security Considerations

- The API key should be kept secret and unique per environment
- Use SSL/TLS for the WebSocket connection in production
- Consider running the agent with minimal privileges
- Protect the configuration file: `chmod 600 /etc/situation-room/agent.yml`

## Development

Run with debug logging:

```bash
python situation-room-agent.py --config agent-config.example.yml --debug
```

## License

Part of the Situation Room project.
