FROM node:22.1.0-alpine3.18 AS build

WORKDIR /usr/src/app

# Run this early for caching
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.1.0-alpine3.18

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-chimer"
LABEL org.opencontainers.image.description="Worker component for bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

WORKDIR /usr/src/app

# Run installation early for caching
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./
ENTRYPOINT [ "node", "index.js" ]