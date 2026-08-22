# ReclaimR API — Fastify + Prisma
#
# Multi-stage build for a pnpm workspace. The key constraint is that the API
# depends on three workspace packages that ship TypeScript source, so the build
# needs the whole monorepo even though the runtime image only needs the bundle
# that tsup produces plus Prisma's query engine.
#
# Build from the REPOSITORY ROOT so the workspace is in context:
#   docker build -f apps/api/Dockerfile -t reclaimr-api .

# ─── Base ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
# libc6-compat is required by Prisma's engine on Alpine.
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# corepack pins the exact pnpm version from package.json, so CI and local builds
# resolve dependencies identically.
RUN corepack enable
# pnpm asks for confirmation before replacing an existing node_modules; in a
# non-interactive build that aborts. CI=true makes it proceed silently, which is
# the documented behaviour for automated environments.
ENV CI=true
WORKDIR /repo

# ─── Dependencies ───────────────────────────────────────────────────────────
# Manifests are copied before sources so this layer is cached until a
# dependency actually changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/queue/package.json ./packages/queue/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
# The API's postinstall runs `prisma generate`, which needs the schema present.
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Build ──────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# tsup bundles the workspace packages in (see apps/api/tsup.config.ts), so the
# output runs under plain node with no TypeScript loader.
RUN pnpm --filter @reclaimr/api build

# ─── Runtime dependencies ───────────────────────────────────────────────────
# A second install with --prod drops dev dependencies (tsup, vitest, eslint)
# from the image while keeping Prisma's runtime and generated client.
FROM deps AS prod-deps
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ─── Runner ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Prisma's CLI is needed at runtime only to apply migrations on deploy; keeping
# it lets the container run `pnpm db:migrate` as a release step.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages ./packages
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/
COPY package.json pnpm-workspace.yaml ./

# Statement uploads land here. Mount a volume over it in any deployment that
# keeps statements on local disk (see docs/DEPLOYMENT.md).
RUN mkdir -p /repo/apps/api/.data/statements && chown -R node:node /repo/apps/api/.data
ENV STATEMENT_STORAGE_DIR=/repo/apps/api/.data/statements

# Drop privileges: nothing the API does needs root.
USER node
WORKDIR /repo/apps/api
EXPOSE 3001

# Hits the liveness route, which deliberately touches no dependencies — so a
# database blip restarts nothing.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
