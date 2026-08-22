# ReclaimR worker — BullMQ consumers (sync, detection, alerts, maintenance)
#
# Same shape as apps/api/Dockerfile. Kept as a separate image because the worker
# scales on queue depth while the API scales on request volume, and because the
# worker must never be reachable from the internet.
#
# Build from the REPOSITORY ROOT:
#   docker build -f apps/worker/Dockerfile -t reclaimr-worker .

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
# pnpm asks for confirmation before replacing an existing node_modules; in a
# non-interactive build that aborts. CI=true makes it proceed silently, which is
# the documented behaviour for automated environments.
ENV CI=true
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/queue/package.json ./packages/queue/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
# Both apps run `prisma generate` on postinstall against this one schema.
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN pnpm --filter @reclaimr/worker build

FROM deps AS prod-deps
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=prod-deps /repo/packages ./packages
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build /repo/apps/worker/package.json ./apps/worker/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY package.json pnpm-workspace.yaml ./

USER node
WORKDIR /repo/apps/worker

# No HEALTHCHECK: the worker exposes no port. Liveness is judged by queue
# progress and log output, which the orchestrator reads, not by an HTTP probe.
CMD ["node", "dist/index.js"]
