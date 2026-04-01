# Backend Deployment

## Overview

The backend deploys automatically via **GitHub Actions** on every push to `main`. The pipeline builds a standalone Next.js + Payload bundle, syncs it to the DigitalOcean droplet over SSH, writes a `.env` file, and restarts PM2.

## Pipeline (`.github/workflows/deploy.yml`)

```
Push to main
  → Checkout + npm ci
  → Restore Next.js build cache
  → Build standalone bundle (npm run build)
  → Setup SSH (ssh-agent)
  → rsync .next/standalone/, .next/static/, public/ to droplet
  → Write .env file to droplet
  → Restart (or start) PM2 process
```

### Build

The build runs on GitHub Actions with all required environment variables injected as secrets. Notable build-time vars:
- `NEXT_PUBLIC_SERVER_URL` — public CMS URL, baked into the JS bundle
- `DATABASE_URL` — needed by Payload during build for schema introspection
- `PAYLOAD_SECRET` — required by Payload at build and runtime
- S3 credentials and DigitalOcean Spaces config

The build uses `--max-old-space-size=8000` to handle Payload's memory-intensive compilation, with a 15-minute job timeout.

### Sync

Three rsync commands deploy the artifacts to `/var/www/intelligent-project-adm/`:
1. `.next/standalone/` → app root (server + node_modules). Excludes `.env` to avoid overwriting runtime secrets.
2. `.next/static/` → `.next/static/` (client assets)
3. `public/` → `public/` (if exists)

### Environment File

The deploy pipeline writes a `.env` file directly to the droplet with `chmod 600`:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<secret>
PAYLOAD_SECRET=<secret>
S3_ACCESS_KEY=<secret>
S3_SECRET_KEY=<secret>
NEXT_PUBLIC_SERVER_URL=<secret>
PAYLOAD_WEBHOOK_SECRET=<secret>
FRONTEND_URL=http://localhost:3001
DIGITALOCEAN_SPACE_REGION=fra1
DIGITALOCEAN_SPACE_ENDPOINT=https://fra1.digitaloceanspaces.com
DIGITALOCEAN_SPACE_BUCKET=intelligent-project
DIGITALOCEAN_SPACE_HOST=fra1.digitaloceanspaces.com
```

### Runtime

PM2 runs the app as `intelligent-project-adm` from `/var/www/intelligent-project-adm/server.js`. Environment variables are loaded from the `.env` file on disk.

The CMS listens on **port 3000** (publicly accessible for admin access and API).

## GitHub Actions Secrets

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SERVER_URL` | Public CMS URL (baked into bundle) |
| `PAYLOAD_SECRET` | Payload encryption secret |
| `DATABASE_URL` | MongoDB connection string |
| `S3_ACCESS_KEY` | DigitalOcean Spaces access key |
| `S3_SECRET_KEY` | DigitalOcean Spaces secret key |
| `PAYLOAD_WEBHOOK_SECRET` | Webhook HMAC secret (shared with frontend) |
| `DROPLET_SSH_KEY` | Private SSH key for deploy user |
| `DROPLET_HOST_KEY` | Droplet's SSH host key (known_hosts) |
| `DROPLET_SSH_PORT` | SSH port (2222) |
| `DROPLET_USER` | SSH user (`deploy`) |
| `DROPLET_HOST` | Droplet public IP |

## Manual Deployment

```bash
# Build (all env vars must be set)
npm run build

# Sync to droplet
rsync -az --delete --exclude='.env' -e "ssh -p 2222" \
  .next/standalone/ deploy@<DROPLET_IP>:/var/www/intelligent-project-adm/
rsync -az --delete -e "ssh -p 2222" \
  .next/static/ deploy@<DROPLET_IP>:/var/www/intelligent-project-adm/.next/static/
rsync -az --delete -e "ssh -p 2222" \
  public/ deploy@<DROPLET_IP>:/var/www/intelligent-project-adm/public/

# Restart on droplet
ssh -p 2222 deploy@<DROPLET_IP> "pm2 restart intelligent-project-adm"
```

## Production Ports

| Port | Service | Access |
|------|---------|--------|
| 3000 | PayloadCMS (PM2) | Public (admin UI + REST API) |
| 3001 | Next.js frontend | Internal (nginx proxies port 80 to it) |
| 80 | nginx | Public (proxies to frontend) |

## Differences from Frontend Deployment

| | Frontend | Backend |
|-|----------|---------|
| Tailscale | Used for secure build-time API access | Not needed (no build-time API calls) |
| `.env` file | Not used — env vars passed inline to PM2 | Written to disk during deploy |
| Build cache | None | Next.js build cache restored between runs |
| Port | 3001 (internal, behind nginx) | 3000 (public) |
