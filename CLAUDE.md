# CLAUDE.md

Architecture notes, conventions, and runbook for **tg-app-meet**. Update this file whenever the structure or schema changes.

## What this is

Telegram Mini App: B2B platform where media buyers and offer owners swipe through each other's profiles, mutually match, and chat anonymously until both sides consent to reveal real `@username`s.

## Tech stack

- **Monorepo:** pnpm workspaces
- **Backend** (`apps/api`): NestJS + TypeScript + Prisma + PostgreSQL + Socket.io
- **Frontend** (`apps/web`): React + Vite + TypeScript + TailwindCSS + `@telegram-apps/sdk-react` + `@telegram-apps/telegram-ui`
- **Bot** (`apps/bot`): grammY (TypeScript)
- **Shared** (`packages/shared`): Zod schemas, TS types, constants
- **Auth:** Telegram `initData` (HMAC-validated on backend) → JWT
- **Local DB:** Postgres 16 via `docker-compose`

## Layout

```
apps/
  api/      # NestJS + Prisma + Socket.io
  web/      # Vite + React + Telegram SDK
  bot/      # grammY long-poll bot
packages/
  shared/   # Zod schemas, types, constants — imported by api, web, bot
docker-compose.yml
.env.example
```

## Run book

```bash
pnpm install
pnpm db:up && pnpm db:migrate    # postgres + first migration

pnpm dev:api    # http://localhost:3001
pnpm dev:web    # http://localhost:5173
pnpm dev:bot    # long-poll
```

Health check: `GET http://localhost:3001/health` → `{ "status": "ok" }`.

### Gotchas

- **dotenv-cli `-o` flag is mandatory in all root scripts.** Without it, any system-level env var (e.g. a User-scope `BOT_TOKEN` left over from another project) silently overrides `.env` — bot will run with the wrong token and `getMe` returns the wrong username.
- **Docker Postgres on port 5544**, not 5432 — local Windows Postgres service occupies 5432 and returns auth errors in CP1251 locale.
- **Mini App needs HTTPS in dev.** Use `cloudflared tunnel --url http://localhost:5173`, copy the public URL into `WEB_APP_URL` in `.env`, restart the bot.
- **Vite 5.4+ blocks unknown Host headers** (`server.allowedHosts`). For dev tunnels we set `allowedHosts: true` in `apps/web/vite.config.ts`. Don't ship that to prod — there we serve static build via nginx, not Vite dev.
- **Mixed-content blocks API calls in dev.** Mini App is served via HTTPS (cloudflared), so it can't `fetch` to `http://localhost:3001` directly. We proxy `/api/*` through Vite (`server.proxy` in `apps/web/vite.config.ts`) and call `/api/...` from React. In prod, set `VITE_API_URL` to the real HTTPS API origin.
- **`apps/api` runs on `@swc-node/register`, NOT `tsx`.** NestJS DI uses `Reflect.getMetadata("design:paramtypes", ...)` to resolve constructor injections by type. `tsx`/esbuild ignores `emitDecoratorMetadata`, so every injected service comes back as `undefined`. SWC honours it via `.swcrc` (`jsc.transform.decoratorMetadata: true`). Don't switch the API back to tsx.
- **TaskStop / Ctrl+C on Windows leaves zombie node children.** When the bot misbehaves after a restart, list `node.exe` processes and force-kill bot-related ones; multiple long-pollers on the same token race for updates.

## Conventions

- IDs: `cuid()`, never auto-increment.
- In chats and any inter-user payload: only `anonId` (`"Buyer #1823"`, `"Owner #77"`). Never expose `telegramId` / `username` cross-user.
- Anti-deanon filter on every chat message before persistence: strip `@mentions`, `t.me/...`, phone numbers → replace with `[hidden]`, return a warning.
- API DTOs are flat and never include internal fields (`telegramId`, `passwordHash`, ...).
- WebSocket event payloads are typed via `@tg-app-meet/shared`.
- Validation: Zod everywhere (request bodies, env, websocket payloads).
- Env: load via a typed `env.ts` module per app; throw on missing required vars at boot.

## Phases

Phase 0 — skeleton (current). Workspace, docker postgres, prisma schema + migration, NestJS `/health`, Vite "Hello %username%", bot `/start` with Web App button.

Phase 1 — auth. `POST /auth/telegram` validates initData → upserts user → JWT. Frontend `useAuth()` hook.

Phase 2 — onboarding & profiles. Role pick (BUYER/OWNER), profile create/edit, `anonId` generation.

Phase 3 — swipes & match. `GET /discover`, `POST /swipes`, mutual LIKE creates Match + Chat.

Phase 4 — anonymous chat. Socket.io `/chat` namespace, anti-deanon filter, history via REST.

Phase 5 — contact reveal. Both-side consent → real `@username` exchanged.

Phase 6 — push via bot. On match / offline new message → bot DM with deep link.

Phase 7 — polish. Errors, toasts, loaders, deploy README.

## Out of scope (for now)

Payments, moderation/reports, analytics, boosts/subscriptions, deep antifraud, CI/CD, prod Docker, k8s, automated tests (added point-wise when needed).

## DB schema (current)

See `apps/api/prisma/schema.prisma`. Source of truth. Mirror any structural change here in a sentence so future-Claude can scan it fast.

- `User` (1)─(1) `BuyerProfile` | `OwnerProfile`  (role-tagged)
- `Swipe (from → to, action)` — unique on `(fromId, toId)`
- Mutual LIKE → `Match` — unique on `(userAId, userBId)`
- `Match` (1)─(1) `Chat` (1)─(N) `Message`
- `Chat` (1)─(N) `ContactReveal` — when both users have a row, contacts unlock.
