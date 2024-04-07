FROM node:20-alpine AS build

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-campa"
LABEL org.opencontainers.image.description="Orchestrator service for bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

WORKDIR /usr/src/app

# Run this early for caching
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bullseye-slim

WORKDIR /usr/src/app

# Run installation early for caching
COPY package*.json ./
RUN npm ci --omit=dev

ARG FLYWAY_VERSION=10.11.0
ARG FLYWAY_SHA1_CHECKSUM=5f29af3966afde97dc02ee604babeb55692aab98
ARG FLYWAY_URL=https://download.red-gate.com/maven/release/com/redgate/flyway/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz

RUN wget -qO flyway.tar.gz ${FLYWAY_URL} && \
    echo "${FLYWAY_SHA1_CHECKSUM} flyway.tar.gz" | sha1sum -c - && \
    tar -xzf flyway.tar.gz && \
    rm flyway.tar.gz && \
    ln -s flyway-${FLYWAY_VERSION}/flyway /usr/local/bin/flyway

COPY ./flyway ./flyway
COPY --from=build /usr/src/app/dist ./
ENTRYPOINT [ "node", "index.js" ]