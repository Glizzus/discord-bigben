FROM node:22.1.0-alpine3.18 AS base

WORKDIR /usr/src/app


FROM base AS dependencies

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY .mocharc.json ./
COPY src ./src
COPY test ./test


FROM dependencies AS build

RUN npm run build


FROM dependencies AS test

ENTRYPOINT [ "npm", "run", "test:unit" ]


FROM node:22.1.0-alpine3.18

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
