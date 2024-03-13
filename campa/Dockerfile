FROM node:20-alpine AS prepare

COPY package*.json ./
# We change the version to 0.0.0 to ensure that bumping the version doesn't
# invalidate our dependencies cache.
RUN npm version --allow-same-version 0.0.0

FROM node:20-alpine AS build

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-campa"
LABEL org.opencontainers.image.description="Orchestrator service for bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

WORKDIR /usr/src/app

COPY --from=prepare package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bullseye-slim

WORKDIR /usr/src/app

# Run installation early for caching
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./
ENTRYPOINT [ "node", "index.js" ]