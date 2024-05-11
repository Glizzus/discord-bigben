FROM minio/mc:RELEASE.2024-05-09T17-04-24Z

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]