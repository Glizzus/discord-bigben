FROM flyway/flyway:10.12.0-alpine

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-migrations"
LABEL org.opencontainers.image.description="The migrations for the discord-bigben project."
LABEL org.opencontainers.image.revision="${GIT_HASH}"

COPY ./flyway /flyway
WORKDIR /flyway
CMD ["migrate"]
