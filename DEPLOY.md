# Deploy — VPS @ 95.217.98.125 (Coolify host)

The VPS already runs Coolify, which owns ports 80/443 via traefik
(`coolify-proxy`). We deploy our own docker-compose stack that joins the
existing `coolify` network so traefik routes our traffic and issues
Let's Encrypt certs for us.

Domain: **meetappbot.online** (Namecheap, BasicDNS).

## 1. DNS — Namecheap

In Namecheap → Domain List → meetappbot.online → **Advanced DNS**:

1. **Delete** the URL Redirect rule (`meetappbot.online → www.meetappbot.online`).
   It will fight with our A records.
2. Add two **A Records**:
   - Host `@`, Value `95.217.98.125`, TTL Automatic
   - Host `www`, Value `95.217.98.125`, TTL Automatic
3. Wait 1–10 min, verify:
   ```bash
   dig +short meetappbot.online
   dig +short www.meetappbot.online
   ```
   Both should return `95.217.98.125`.

## 2. First-time bootstrap on the VPS

```bash
ssh root@95.217.98.125

# Pull the repo into /opt
mkdir -p /opt && cd /opt
git clone https://github.com/Tmwyw/match_app.git tg-app-meet
cd tg-app-meet

# Configure secrets
cp .env.production.example .env
# Edit .env — set strong POSTGRES_PASSWORD, JWT_SECRET, ADMIN_TOKEN,
# BOT_TOKEN, ADMIN_TELEGRAM_IDS. DOMAIN already defaulted to meetappbot.online.
nano .env

# Sanity: the coolify network must exist
docker network ls | grep coolify

# Build + start
chmod +x deploy.sh apps/api/docker-entrypoint.sh
docker compose -f docker-compose.prod.yml --env-file .env build
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

First boot of the API runs `prisma migrate deploy` automatically. Watch
for `[api] running prisma migrate deploy…` and `[api] launching: …`.

## 3. Telegram side

Once `https://meetappbot.online` returns the Mini App:

1. In **@BotFather** → `/mybots` → your bot → **Bot Settings** → **Menu Button** → set to `https://meetappbot.online`.
2. Same path → **Configure Mini App** → set web app URL to `https://meetappbot.online`.
3. Restart the bot container so its `setMyCommands` + menu-button setup uses
   the new URL: `docker compose restart bot`.

## 4. Smoke tests

From your laptop:

```bash
curl -s https://meetappbot.online/api/health
# → {"status":"ok"}

curl -sI https://meetappbot.online/
# → HTTP/2 200, content-type: text/html
```

Open the Telegram bot, click the Mini App button. Should load.

## 5. Subsequent deploys

```bash
ssh root@95.217.98.125
cd /opt/tg-app-meet
./deploy.sh
```

Pulls latest, rebuilds, restarts. `prisma migrate deploy` runs on every API
boot; new migrations apply automatically.

## 6. Logs / debugging

```bash
docker compose -f /opt/tg-app-meet/docker-compose.prod.yml logs -f api
docker compose -f /opt/tg-app-meet/docker-compose.prod.yml logs -f bot
docker compose -f /opt/tg-app-meet/docker-compose.prod.yml logs -f web
```

Traefik routing inspection:
```bash
docker logs coolify-proxy 2>&1 | tail -50
```

## 7. Backups (recommended, not yet automated)

```bash
docker exec tgmeet-postgres pg_dump -U tgmeet tgmeet | gzip > /opt/tg-app-meet/backups/$(date +%F).sql.gz
```

Add to `crontab -e`:
```
0 4 * * * docker exec tgmeet-postgres pg_dump -U tgmeet tgmeet | gzip > /opt/tg-app-meet/backups/$(date +\%F).sql.gz && find /opt/tg-app-meet/backups -name '*.sql.gz' -mtime +14 -delete
```

## Gotchas observed during setup

- **`coolify` network must exist** before `docker compose up`. If you see
  `network coolify declared as external, but could not be found`, then
  Coolify isn't running. Start it: `docker compose -f /data/coolify/source/docker-compose.yml up -d` (path may vary).
- **Cert resolver name**. We assume Coolify's traefik uses `letsencrypt`.
  If the cert doesn't issue, check `docker exec coolify-proxy cat /traefik.yml | grep -A2 certificatesResolvers` for the actual name and update the labels in `docker-compose.prod.yml`.
- **Apex A-record propagation**. Some registrars cache aggressively;
  if `dig` returns the old value after 30 min, force-refresh via `dig +trace`.
- **Mini App can't load on first cert issuance**. Traefik issues the
  Let's Encrypt cert lazily on first request. The first browser hit may
  fail with TLS error — refresh after 30s.
