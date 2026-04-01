# Droplet Setup — intelligent-project-adm

Step-by-step guide for provisioning a fresh DigitalOcean droplet for this deployment.

## Prerequisites

- Ubuntu 22.04 LTS droplet (1GB RAM minimum, 2GB recommended)
- A domain pointed at the droplet IP
- Root SSH access to the fresh droplet

---

## 1. Initial System Setup

```bash
# Login as root
ssh root@YOUR_DROPLET_IP

# Update packages
apt update && apt upgrade -y

# Install essentials
apt install -y curl git ufw nginx certbot python3-certbot-nginx
```

---

## 2. Create Deploy User

The GitHub Actions workflow connects as a dedicated non-root user.

```bash
adduser deploy
# Set a strong password when prompted

# Grant sudo for service management (PM2 restart etc.)
usermod -aG sudo deploy
```

---

## 3. Harden SSH

Pick a non-standard port (e.g. 2222). This becomes your `DROPLET_SSH_PORT` secret.

```bash
nano /etc/ssh/sshd_config
```

Change/set these values:

```
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

Restart SSH — **keep your current session open** until you confirm the new port works:

```bash
systemctl restart sshd
```

Test in a new terminal before closing:

```bash
ssh -p 2222 root@YOUR_DROPLET_IP
```

---

## 4. Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 2222/tcp   # SSH (your chosen port)
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw enable
ufw status
```

---

## 5. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # should print v20.x.x
```

---

## 6. Install PM2

```bash
npm install -g pm2

# Configure PM2 to start on reboot (run as root, copy the generated command)
pm2 startup systemd
# It will print a command like: sudo env PATH=... pm2 startup systemd -u deploy --hp /home/deploy
# Run that command exactly as printed
```

---

## 7. Create App Directory

```bash
mkdir -p /var/www/intelligent-project-adm/.next/static
mkdir -p /var/www/intelligent-project-adm/public
chown -R deploy:deploy /var/www/intelligent-project-adm
```

---

## 8. Configure Nginx

```bash
nano /etc/nginx/sites-available/intelligent-project-adm
```

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/intelligent-project-adm /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 9. SSL Certificate

```bash
certbot --nginx -d YOUR_DOMAIN
# Follow prompts, choose to redirect HTTP → HTTPS

# Verify auto-renewal
systemctl status certbot.timer
```

---

## 10. Generate SSH Deploy Key

Do this **locally** (not on the droplet):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/intelligent-project-adm-deploy -N ""
```

This creates two files:
- `~/.ssh/intelligent-project-adm-deploy` — **private key** → goes into GitHub secret
- `~/.ssh/intelligent-project-adm-deploy.pub` — **public key** → goes onto the droplet

Copy the public key to the droplet:

```bash
ssh-copy-id -i ~/.ssh/intelligent-project-adm-deploy.pub -p 2222 deploy@YOUR_DROPLET_IP
```

Or manually:

```bash
# On the droplet as deploy user
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## 11. Get Host Key for known_hosts

Run this locally to get the value for `DROPLET_HOST_KEY`:

```bash
ssh-keyscan -p 2222 YOUR_DROPLET_IP
```

Copy the line that starts with `[YOUR_DROPLET_IP]:2222 ssh-ed25519 ...`

---

## 12. GitHub Secrets Checklist

Go to **GitHub → repo → Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `DROPLET_HOST` | Droplet IP or domain |
| `DROPLET_SSH_PORT` | `2222` (or your chosen port) |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | Contents of `~/.ssh/intelligent-project-adm-deploy` (private key) |
| `DROPLET_HOST_KEY` | Line from `ssh-keyscan` output above |
| `NEXT_PUBLIC_SERVER_URL` | `https://YOUR_DOMAIN` |
| `PAYLOAD_SECRET` | Random 32+ char string |
| `DATABASE_URL` | MongoDB connection string |
| `S3_ACCESS_KEY` | DigitalOcean Spaces access key |
| `S3_SECRET_KEY` | DigitalOcean Spaces secret key |
| `PAYLOAD_WEBHOOK_SECRET` | Random 32+ char string |

---

## 13. First Deploy

Push to `main` or trigger the workflow manually. After it completes:

```bash
# On the droplet, verify PM2 is running
pm2 status
pm2 logs intelligent-project-adm --lines 50

# Save PM2 process list to survive reboots
pm2 save
```

The app should be live at `https://YOUR_DOMAIN`.