FROM minio/mc:RELEASE.2024-05-09T17-04-24Z

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-minio-setup"
LABEL org.opencontainers.image.description="The setup container for Minio in the discord-bigben project."
LABEL org.opencontainers.image.revision="${GIT_HASH}"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]