# Build from the repository root:
#   docker build -f apps/api/Dockerfile .
#
# Node 24 is required: TypeORM 1.x needs >= 24.11.
FROM node:24.21.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are reused until a manifest changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @cv-builder/api...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# `nest build` also copies the PDF fonts next to the compiled code.
RUN pnpm --filter @cv-builder/api build

# Runtime dependencies only. The contracts package is types, so it is not needed.
FROM manifests AS production-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @cv-builder/api

FROM node:24.21.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=production-deps /repo/node_modules node_modules
COPY --from=production-deps /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/package.json apps/api/
WORKDIR /repo/apps/api
USER node
EXPOSE 3001
# Pending migrations are applied on start.
CMD ["node", "dist/main.js"]
