FROM golang:1.22-alpine3.19 AS builder

RUN apk update && apk add --no-cache ca-certificates=20240226-r0

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY main.go ./

ARG BUILD_CACHE=/root/.cache/go-build
RUN --mount=type=cache,target=${BUILD_CACHE} \
    GOCACHE=${BUILD_CACHE} \
    CGO_ENABLED=0 \
    GOOS=linux \
    go build -ldflags="-s -w" -a -installsuffix cgo -o warehouse .

FROM scratch

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-warehouse"
LABEL org.opencontainers.image.description="The storage service for discord-bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/warehouse /warehouse

ENTRYPOINT [ "/warehouse" ]