FROM mariadb:10.3

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-mariadb"
LABEL org.opencontainers.image.description="MariaDB with migration scripts for discord-bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

# We copy these instead of using a volume because we want to ensure that the
# image is cached when there are no schema changes, and that the schema is
# always up to date when there are changes.
COPY ./system/*.sql /docker-entrypoint-initdb.d/
COPY ./app/*.sql /docker-entrypoint-initdb.d/
