FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Run this early for caching
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bullseye-slim

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-campa"
LABEL org.opencontainers.image.description="Orchestrator service for bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

WORKDIR /usr/src/app

# Run installation early for caching
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./
ENTRYPOINT [ "node", "index.js" ]
