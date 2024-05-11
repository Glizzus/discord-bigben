FROM alpine:3.19.1

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-mariadb-setup"
LABEL org.opencontainers.image.description="The setup container for Mariadb in the discord-bigben project."
LABEL org.opencontainers.image.revision="${GIT_HASH}"

RUN apk add --no-cache mariadb-client=10.11.6-r0

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
