# ResellNom Server Monitor

Central dashboard for Linux server health monitoring plus an admin-only SSH terminal.

## Security model
- Agent authenticates with a per-server random token; only its SHA-256 hash is stored.
- SSH private keys are encrypted at rest with AES-256-GCM using `MASTER_KEY_HEX`.
- SSH host keys are pinned by fingerprint; do not use an unverified host key in production.
- Admin login uses bcrypt and short-lived JWTs.
- API and login endpoints are rate limited.
- Helmet security headers, JSON size limits and audit logging are enabled.
- Monitor binds to `127.0.0.1`; put it behind an HTTPS reverse proxy.
- Never commit `.env`, database files, SSH keys or agent tokens.

## Install central monitor

```bash
cd /opt
# copy monitor directory here
cd resellnom-monitor
npm ci --omit=dev
sudo useradd --system --home /opt/resellnom-monitor --shell /usr/sbin/nologin resellnom-monitor || true
sudo chown -R resellnom-monitor:resellnom-monitor /opt/resellnom-monitor
sudo install -m 600 /path/to/resellnom-monitor.env /etc/resellnom-monitor.env
sudo cp systemd/resellnom-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now resellnom-monitor
```

Generate secrets with `openssl rand -hex 32`. Generate the admin bcrypt hash with Node/bcryptjs before putting it in `/etc/resellnom-monitor.env`.

## Add a server

Use the authenticated `POST /api/servers` endpoint with:
- `name`
- `hostname`
- `sshUser`
- `sshPort`
- `sshPrivateKey` (optional until terminal is needed)
- `sshHostFingerprint` (required, pin the exact SSH host fingerprint)

The response contains the **one-time agent token**. Store it only on the target server.

## Agent

Copy `agent/resellnom-agent.sh` to the monitored Linux server and create `/etc/resellnom-agent.conf`:

```bash
MONITOR_URL="https://monitor.example.com"
AGENT_TOKEN="PASTE_ONE_TIME_TOKEN_HERE"
```

Then:

```bash
sudo install -m 700 agent/resellnom-agent.sh /usr/local/sbin/resellnom-agent
sudo install -m 600 /etc/resellnom-agent.conf /etc/resellnom-agent.conf
sudo /usr/local/sbin/resellnom-agent
```

Run it every minute with a systemd timer or cron. A 60-second interval is recommended. The central monitor marks a server offline after 120 seconds without a heartbeat.

## Production requirements

Terminate TLS at a trusted reverse proxy, restrict the monitor port to localhost/private network, use a firewall, protect `/api` and `/ws` at the proxy where possible, back up `data/monitor.db`, rotate agent tokens if exposed, and use a dedicated non-root SSH account with the minimum required permissions whenever a full root shell is not required.

The SSH terminal is intentionally powerful. Keep admin credentials and the monitor host itself tightly controlled.
