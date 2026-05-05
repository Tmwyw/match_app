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
- **`prisma generate` after a migration EPERMs on Windows if `dev:api` is running** — `@swc-node/register` keeps `query_engine-windows.dll.node` open. Stop the api dev tree first, then re-run `pnpm db:generate` (or just rerun the failed `pnpm db:migrate` once api is down).
- **`@UsePipes()` at method level applies the pipe to ALL params, not just `@Body()`.** When a controller method also has `@CurrentUser()` (or any other custom param decorator), the Zod pipe will validate the auth payload as if it were the request body and fail with confusing "field required" errors. Bind the pipe to `@Body(new ZodValidationPipe(Schema))` instead.
- **WebSocket auth must run as Socket.io middleware (`server.use`), not in `handleConnection`.** Async work in `handleConnection` resolves AFTER socket.io has already emitted `connect` to the client, so the client sees a phantom session even when we then `disconnect()`. Middleware in `OnGatewayInit.afterInit(server)` rejects pre-handshake → client sees `connect_error`. Pattern lives in `apps/api/src/chat/chat.gateway.ts`.
- **Vite proxy ordering matters.** More specific paths (`/api/socket.io` with `ws: true`) MUST come BEFORE the generic `/api` entry in `apps/web/vite.config.ts`. Otherwise WS upgrade requests get routed by the catch-all and Socket.io breaks silently.
- **Telegram mobile webviews can silently drop `localStorage`.** Some iOS Telegram webview sessions accept `setItem` but return `null` on subsequent `getItem`. Auth then "succeeds" (UI advances) but every request after goes out without the Bearer header → server replies `missing bearer token`. `apps/web/src/api.ts` keeps an in-memory token as the primary store; localStorage is best-effort for surviving page reloads. Don't rely on localStorage alone for anything critical.
- **`pnpm db:migrate -- --name X` doesn't pass `--name` through.** The double-dash gets eaten by intermediate pnpm wrappers and Prisma drops into the interactive name prompt. Use the full chain: `npx dotenv-cli -e .env -o -- pnpm --filter @tg-app-meet/api exec prisma migrate dev --name <name>`. Or just run `pnpm db:migrate` and type the name when prompted.
- **Telegram webview overpaints `<html>`/`<body>` backgrounds.** Setting our gradient on `html { background }` or via `body::before` collapses to flat black on several Telegram clients. Reliable approach: a real DOM div with `position: fixed; z-index: 0` rendered as the first child of `<App />`, with content wrapped in `position: relative; z-index: 10`. Lives in `apps/web/src/ui/Background.tsx` — don't try to "simplify" back to body bg.
- **Forced brand palette, ignoring TG theme vars for surfaces.** `--tg-theme-secondary-bg-color` collapsed cards/inputs into the page bg on some user themes. The Tailwind tokens (`bg-card`, `bg-glass*`) now resolve to fixed `--app-glass*` rgba colours that always contrast against our gradient. Don't reintroduce `var(--tg-theme-*)` for surfaces (text colour stays at `--app-text` for the same reason).

## Frontend UI

- **Primitives live in `apps/web/src/ui/`.** When you need a button, card, input, chip-select, role avatar, tab bar, etc — import from `../ui` (or `./ui`). Don't reinvent locally with raw Tailwind in screens.
- **Design tokens in `apps/web/src/styles.css` + `tailwind.config.js`.** Brand purple `--accent` is independent of `--tg-theme-button-color` so the accent stays consistent across user themes. `bg-card`, `bg-tg-bg`, `text-tg-text`, `text-tg-hint`, `bg-accent`, `text-accent`, `bg-role-buyer`, `bg-role-owner`, `bg-danger`, `bg-success`. Radii: `rounded-card`, `rounded-button`. Add new tokens to BOTH styles.css (CSS var) and tailwind.config.js (utility) to keep them in one place.
- Icons: `lucide-react`. No emoji-as-icon in primitives.
- `safe-bottom` / `pb-safe` helpers handle iPhone home-indicator padding.

## Conventions

- IDs: `cuid()`, never auto-increment.
- In chats and any inter-user payload: only `anonId` (`"Buyer #1823"`, `"Owner #77"`). Never expose `telegramId` / `username` cross-user.
- Anti-deanon filter on every chat message before persistence: strip `@mentions`, `t.me/...`, phone numbers → replace with `[hidden]`, return a warning.
- API DTOs are flat and never include internal fields (`telegramId`, `passwordHash`, ...).
- WebSocket event payloads are typed via `@tg-app-meet/shared`.
- Validation: Zod everywhere (request bodies, env, websocket payloads).
- Env: load via a typed `env.ts` module per app; throw on missing required vars at boot.

## Phases

Phase 0 — skeleton (done). Workspace, docker postgres, prisma schema + migration, NestJS `/health`, Vite "Hello %username%", bot `/start` with Web App button.

Phase 1 — auth (done). `POST /auth/telegram` validates initData (HMAC + 24h freshness) → upserts user → JWT (30d). `GET /me` (Bearer-protected). Frontend `useAuth()` hook + `apps/web/src/api.ts` fetch wrapper. `User.role` and `User.anonId` made nullable — assigned in Phase 2.

Phase 2 — onboarding & profiles (done). `POST /onboarding/role` atomically assigns role + per-role `anonId` from `AnonCounter`. `GET/POST/PATCH /me/profile` with role-aware Zod (BuyerProfileInput / OwnerProfileInput). Frontend: `RolePicker`, `BuyerProfileForm`, `OwnerProfileForm`, `MyProfile` (read+edit), `useProfile()` hook, App.tsx state-machine routing (auth → role → profile → my-profile).

Phase 3 — swipes & match (done). `GET /discover` returns one compatible card of the opposite role (vertical/geo overlap, exclude already-swiped). `POST /swipes` is idempotent; mutual LIKE → atomic `Match` + `Chat` (lex-normalized pair). `GET /matches` returns each match with the other user's `PublicCard` (no telegramId/username). Frontend: `Deck` (Like/Skip + match overlay), `MatchesList`, bottom tab `Найти/Матчи/Профиль`.

Phase 2.5 — visual design pass (done). Brand purple accent (`--accent`), Inter font, role-tinted avatars, telegram-native dark via CSS theme vars, shared `apps/web/src/ui/` primitives (Screen, AppHeader, Card, Section, Button, BigActionButton, TabBar, RoleAvatar, Field, Textarea, ChipGroup, MatchOverlay, CenteredMessage). All screens (RolePicker, profile forms, MyProfile, Deck, MatchesList) refactored to use the primitives — no per-component hardcoded colors.

Phase 4 — anonymous chat (done). Socket.io `/chat` namespace via `@nestjs/platform-socket.io`. JWT auth in `server.use` middleware (rejects pre-`connect` so client sees `connect_error`, not phantom session). `chat:join` re-validates participation on every join (don't trust room membership). `message:send` runs `antiDeanon` (regex-scrubs `@username`, `t.me/...`, generic urls, phones, emails — replaced with `[скрыто]`) before persistence; broadcast goes to room minus sender, sender gets the saved message back via ack so optimistic UI replaces with real id+timestamp. REST `GET /chats/:chatId/messages?before&limit` for history (cursor-based, default 50, hasMore flag). Frontend: singleton socket in `apps/web/src/chat/socket.ts` (uses `/api/socket.io` Vite proxy in dev, direct `/socket.io` against `VITE_API_URL` in prod), `useChat` hook (history + live + optimistic + ack), `ChatScreen` (bubbles, sticky composer, filtered-warning banner, Lock disclaimer). `ChatScreen` rendered as `fixed inset-0 z-30` overlay over the tab content, opened from `MatchesList` tap or from `MatchOverlay` "Перейти в чат" CTA (Deck → App.openChat).

Phase 5 — contact reveal (done). `RevealService` + `RevealController` (`apps/api/src/reveal/`) expose `GET/POST /chats/:chatId/reveal` (JWT-guarded, participant-checked via `ChatService.assertParticipant`). `POST` is idempotent via `prisma.contactReveal.upsert` on the `(chatId, userId)` unique key. After accept, the service computes a per-user `RevealStatus` for both participants and emits `WsServerEvents.RevealUpdated` (`reveal:updated`) to each user's room. **User-rooms (`user:<userId>`)** are joined automatically in `ChatGateway`'s auth middleware, so the server can push to a specific user regardless of which chat room they're in. `otherUsername` is only included when both `meAccepted && otherAccepted`; if the target user's `User.username` is `null` (Telegram-side hidden), it stays `null` even after consent and the UI shows a "set a username" hint. Frontend: `useChat` loads initial reveal status, subscribes to `reveal:updated`, exposes `requestReveal()` (optimistic flip → POST → reconcile). `ChatScreen` `<RevealBanner>` switches between four states (no consent / I accepted / they accepted / both accepted) and renders a `tg://resolve?domain=username` link once unlocked.

Phase 6 — push via bot (done). `NotificationsModule` (`apps/api/src/notifications/`, `@Global()`) wraps a singleton `grammy` `Bot` used **only as a Telegram Bot API client** (no `bot.start()` — the long-poller is `apps/bot`, two pollers on the same token race for `getUpdates`). `notifyMatch(toUserId, otherAnonId)` fires from `SwipesService` for both users right after the transactional match commit, fire-and-forget. `notifyMessage(toUserId, fromAnonId, chatId, content)` fires from `ChatGateway.onSend` after the message persists, **only when `gateway.isOnline(recipientId)` is false** (per-user socket presence map updated in auth middleware + `handleDisconnect`). Per-`(chatId, recipient)` 30s in-memory debounce stops spam. Filtered (anti-deanon) content is what gets pushed — never the raw input. Errors from `bot.api.sendMessage` (blocked-bot 403, chat not found) are caught and logged, never propagated. Inline keyboard `[{ text: "Открыть", web_app: { url: env.WEB_APP_URL } }]` opens the Mini App from the DM. New env: `WEB_APP_URL` is now required by `apps/api/src/env.ts`.

Phase 7 — polish (current). Errors, toasts, loaders, deploy README.


## Out of scope (for now)

Payments, moderation/reports, analytics, boosts/subscriptions, deep antifraud, CI/CD, prod Docker, k8s, automated tests (added point-wise when needed).

## DB schema (current)

See `apps/api/prisma/schema.prisma`. Source of truth. Mirror any structural change here in a sentence so future-Claude can scan it fast.

- `User` — `role` and `anonId` are nullable; populated during Phase 2 onboarding, NULL after first auth.
- `AnonCounter (role @id, next)` — per-role monotonic counter. Atomic `upsert + increment` inside a `$transaction` issues each `Buyer #N` / `Owner #N`.
- `User` (1)─(1) `BuyerProfile` | `OwnerProfile`  (role-tagged)
- `Swipe (from → to, action)` — unique on `(fromId, toId)`
- Mutual LIKE → `Match` — unique on `(userAId, userBId)`
- `Match` (1)─(1) `Chat` (1)─(N) `Message`
- `Chat` (1)─(N) `ContactReveal` — when both users have a row, contacts unlock.
- `Chat` (1)─(N) `Message` — anti-deanon regex scrub (`apps/api/src/chat/anti-deanon.ts`) runs in `ChatService.sendMessage` before insert; never trust client-side filtering.
