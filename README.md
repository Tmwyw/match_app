# TG APP MEET

Telegram Mini App for matching media buyers ↔ offer owners (Tinder-style swipes → mutual match → anonymous chat → consent-based contact reveal).

Stack: pnpm workspaces · NestJS · Prisma · PostgreSQL · React + Vite + `@telegram-apps/sdk-react` · grammY · Socket.io · Zod.

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10 (`npm i -g pnpm`)
- Docker Desktop (for local Postgres)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A tunnel for the Mini App URL (cloudflared / ngrok) so Telegram can load it over HTTPS

> The dockerized Postgres is mapped to host port **5544** (not 5432) to avoid clashing with a locally-installed Postgres service. If you want to change it, set `POSTGRES_PORT` in `.env` and update `DATABASE_URL` accordingly.

## First-time setup

```bash
cp .env.example .env          # then fill BOT_TOKEN and WEB_APP_URL
pnpm install
pnpm db:up                    # starts postgres in docker
pnpm db:migrate               # applies prisma migrations + generates client
```

## Day-to-day

Run each in its own terminal:

```bash
pnpm dev:api      # NestJS on http://localhost:3001  (GET /health)
pnpm dev:web      # Vite on  http://localhost:5173
pnpm dev:bot      # grammY long-poll bot
```

DB helpers:

```bash
pnpm db:up        # start postgres
pnpm db:down      # stop postgres
pnpm db:logs      # tail postgres logs
pnpm db:studio    # open Prisma Studio
```

## Exposing the Mini App to Telegram

Telegram requires HTTPS. Easiest local option:

```bash
# in another terminal, after `pnpm dev:web` is running
cloudflared tunnel --url http://localhost:5173
# copy the printed https://...trycloudflare.com URL into .env as WEB_APP_URL
# restart `pnpm dev:bot` so the new URL is picked up
```

Then in Telegram → open the bot → `/start` → tap **Open app**.

## Layout

```
apps/
  api/            # NestJS + Prisma
  web/            # React Mini App
  bot/            # grammY bot
packages/
  shared/         # types, zod schemas, constants
docker-compose.yml
```

See [`CLAUDE.md`](./CLAUDE.md) for architecture notes, conventions, and the phased build plan.
