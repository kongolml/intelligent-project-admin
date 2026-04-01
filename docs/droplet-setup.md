# Droplet Setup Guide

Fresh DigitalOcean Ubuntu droplet setup for running the frontend (Next.js) and backend (PayloadCMS) with nginx, PM2, Tailscale, and GitHub Actions deployment.

## Architecture

- **Port 80** — nginx → frontend (`localhost:3001`)
- **Port 3000** — PayloadCMS (direct, public)
- **Port 3001** — Next.js (internal only, nginx proxies to it)
- **Port 2222** — SSH (non-default)
- Deployment via GitHub Actions over SSH + Tailscale

---

## 1. Initial Server Access

```bash
ssh root@YOUR_DROPLET_IP
```

---

## 2. Create Deploy User

```bash
adduser deploy
usermod -aG sudo deploy

# Copy SSH keys so GitHub Actions can connect
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

---

## 3. Change SSH Port

```bash
nano /etc/ssh/sshd_config
# Set: Port 2222
systemctl restart ssh
```

> Keep your current session open and test the new port in a second terminal before closing.

---

## 4. Configure UFW Firewall

```bash
ufw allow 2222/tcp   # SSH
ufw allow 80/tcp     # nginx (frontend)
ufw allow 3000/tcp   # PayloadCMS
ufw deny 3001/tcp    # Next.js (nginx handles it)
ufw enable
ufw status
```

---

## 5. Install Node.js (via nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
```

Repeat for the `deploy` user:

```bash
su - deploy
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
exit
```

---

## 6. Install PM2

```bash
su - deploy
npm install -g pm2
pm2 startup  # follow the printed command to enable on boot
exit
```

---

## 7. Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Allow Tailscale interface through UFW:

```bash
ufw allow in on tailscale0
```

---

## 8. Install and Configure nginx

```bash
apt update && apt install -y nginx
```

Create the site config:

```bash
nano /etc/nginx/sites-available/intelligent-frontend
```

Paste:

```nginx
server {
    listen 80;
    server_name _;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/intelligent-frontend /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl start nginx
```

---

## 9. Create App Directories

```bash
mkdir -p /var/www/intelligent-project-frontend
mkdir -p /var/www/intelligent-project-adm
chown -R deploy:deploy /var/www/intelligent-project-frontend
chown -R deploy:deploy /var/www/intelligent-project-adm
```

---

## 10. GitHub Actions Secrets

### Frontend repo secrets

| Secret | Value |
|--------|-------|
| `DROPLET_HOST` | Droplet IP address |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_PORT` | `2222` |
| `DROPLET_SSH_KEY` | Private SSH key (deploy user) |
| `DROPLET_HOST_KEY` | Output of `ssh-keyscan -p 2222 YOUR_IP` |
| `TAILSCALE_OAUTH_CLIENT_ID` | From Tailscale admin |
| `TAILSCALE_OAUTH_SECRET` | From Tailscale admin |
| `TAILSCALE_IP` | Droplet's Tailscale IP (`tailscale ip -4`) |
| `PAYLOAD_WEBHOOK_SECRET` | Webhook HMAC secret |

### Backend repo secrets

| Secret | Value |
|--------|-------|
| `DROPLET_HOST` | Droplet IP address |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_PORT` | `2222` |
| `DROPLET_SSH_KEY` | Private SSH key (deploy user) |
| `DROPLET_HOST_KEY` | Output of `ssh-keyscan -p 2222 YOUR_IP` |
| `NEXT_PUBLIC_SERVER_URL` | Public CMS URL |
| `PAYLOAD_SECRET` | Payload encryption secret |
| `DATABASE_URL` | MongoDB connection string |
| `S3_ACCESS_KEY` | DigitalOcean Spaces access key |
| `S3_SECRET_KEY` | DigitalOcean Spaces secret key |
| `PAYLOAD_WEBHOOK_SECRET` | Webhook HMAC secret |

---

## 11. First Deploy

Push to `main` on both repos to trigger GitHub Actions.

After the first deploy, PM2 should have both processes running:

```bash
su - deploy
pm2 list
# Should show:
#   intelligent-project-frontend
#   intelligent-project-adm
```

Save the PM2 process list so they restart on reboot:

```bash
pm2 save
```

---

## Verification Checklist

```bash
# nginx proxying correctly
curl -I http://localhost:80

# Frontend reachable
curl -I http://YOUR_IP

# CMS reachable
curl -I http://YOUR_IP:3000

# PM2 apps running
su - deploy -c "pm2 list"

# Firewall rules
ufw status
```

---

## Adding SSL (when you have a domain)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

Certbot will update the nginx config automatically and set up auto-renewal.
