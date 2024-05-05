FROM alpine:3.19.1

RUN apk add --no-cache mariadb-client=10.11.6-r0

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]