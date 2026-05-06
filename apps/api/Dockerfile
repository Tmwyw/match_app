# syntax=docker/dockerfile:1.7
# ---- base ----------------------------------------------------------------
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

# Native deps for prisma + @swc/core
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

# ---- deps ----------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @tg-app-meet/api... --filter @tg-app-meet/shared

# ---- build ---------------------------------------------------------------
# We don't tsc-compile the API: NestJS DI relies on `emitDecoratorMetadata`
# which only @swc/core honours via .swcrc (tsx/esbuild silently drop it,
# breaking constructor injection). Same reason dev uses @swc-node/register.
# In prod we run TS source through the same loader — startup cost is ~1s,
# memory delta is negligible, and we sidestep the shared-package
# build pipeline (shared is "main": "./src/index.ts", so any compiled
# downstream needs `.js` extensions in shared's exports — not worth the churn).
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @tg-app-meet/api exec prisma generate

# ---- runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Source — we run TS directly via @swc-node/register
COPY --from=build /repo/apps/api/src ./apps/api/src
COPY --from=build /repo/apps/api/.swcrc ./apps/api/.swcrc
COPY --from=build /repo/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Entrypoint runs `prisma migrate deploy` (idempotent) before booting the server.
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "--require", "@swc-node/register", "apps/api/src/main.ts"]
