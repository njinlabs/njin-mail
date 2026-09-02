# Deploying njin-mail

Target: a single Linux VPS running the app as a systemd service, fronted by
Caddy for automatic HTTPS per tenant hostname.

## Why this shape (not serverless / not multi-instance)

- **SQLite on local disk** (`bun:sqlite`) — needs a persistent filesystem and
  a single writer process. Serverless platforms (Vercel, Cloudflare Workers,
  etc.) don't give you that.
- **Sessions live in an in-memory `Map`** (by design — see root `CLAUDE.md`)
  — only one process can own it, so this can't be horizontally scaled behind
  a load balancer without moving sessions to something external (e.g. Redis)
  first. Not needed at this scale; keep it in mind if that ever changes.
- One consequence: **every deploy/restart logs everyone out.** Deploy during
  low-traffic windows.

## One-time server setup

```bash
# As root/sudo:
adduser --system --group --home /opt/njin-mail njinmail
mkdir -p /opt/njin-mail
chown njinmail:njinmail /opt/njin-mail

# Install Bun as the njinmail user:
su - njinmail -c 'curl -fsSL https://bun.sh/install | bash'

# Install Caddy (Debian/Ubuntu):
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Open firewall ports **80 and 443 only**. Port 3001 (the app) binds to
`127.0.0.1` in code — it's not reachable externally even without a firewall
rule, but don't rely on that alone.

## First deploy

```bash
su - njinmail
cd /opt/njin-mail
git clone <repo-url> .
bun install --frozen-lockfile

cp deploy/.env.production.example .env
# Edit .env: generate real CREDENTIAL_ENCRYPTION_KEY / SESSION_SECRET
#   bun -e "console.log(crypto.randomBytes(32).toString('base64'))"
# Confirm NODE_ENV=production and that DEV_TENANT_DOMAIN is NOT set.
chmod 600 .env

bun run build
bun run db:migrate
exit  # back to root/sudo
```

Install the systemd unit and Caddy config:

```bash
sudo cp /opt/njin-mail/deploy/njin-mail.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now njin-mail
sudo systemctl status njin-mail   # should show "active (running)"

sudo cp /opt/njin-mail/deploy/Caddyfile /etc/caddy/Caddyfile
# Edit /etc/caddy/Caddyfile: confirm the tenant domain(s) listed are correct
# and DNS for each already points at this server's IP, AND confirm the
# `root *` path in the `webmail` snippet actually matches where you cloned
# the repo (it must point at <repo>/apps/web/dist) — Caddy serves the built
# frontend directly off disk and only proxies /api/* to the backend, so a
# wrong path here means every non-API page 404s even though the app is
# perfectly healthy.
sudo systemctl reload caddy
```

Verify: `curl -sI https://mail.<tenant-domain>/api/health` should return `200`.

## Onboarding a new tenant

1. Client points `mail.<their-domain>` (CNAME/A) at this server's IP.
2. Add a block to `/etc/caddy/Caddyfile`:
   ```
   mail.<their-domain> {
       import webmail
   }
   ```
3. `sudo systemctl reload caddy` — Caddy fetches a Let's Encrypt cert
   automatically. No app deploy, restart, or DB migration needed; the backend
   already accepts any Host header whose domain matches a real IMAP user
   (see `apps/server/src/lib/tenant.ts`).

## Redeploying (code changes)

```bash
su - njinmail
cd /opt/njin-mail
git pull
bun install --frozen-lockfile
bun run build
bun run db:migrate   # no-op if no new migrations
exit
sudo systemctl restart njin-mail
```

This logs out every currently-logged-in user (in-memory sessions) — do it in
a low-traffic window.

## Backups

Back up `/opt/njin-mail/apps/server/data/njin-mail.sqlite` (WAL mode — for a
consistent snapshot while the process is running, use `sqlite3 <path>
".backup /path/to/backup.sqlite"` rather than copying the file directly).
Everything in it (folders/messages/attachment metadata) is a resyncable IMAP
cache except the `users` table, which is small and holds no passwords.

## Logs / health

`journalctl -u njin-mail -f` for app logs (stdout/stderr, no separate log
files to manage). `GET /api/health` for uptime checks.
