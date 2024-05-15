FROM golang:1.22.2-alpine3.19 AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY *.go ./

ARG BUILD_CACHE=/root/.cache/go-build
RUN --mount=type=cache,target=${BUILD_CACHE} \
    GOCACHE=${BUILD_CACHE} \
    CGO_ENABLED=0 \
    GOOS=linux \
    go build -ldflags="-s -w" -a -installsuffix cgo -o warehouse .

FROM golang:1.22.2-alpine3.19 AS test

RUN mkdir /results

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY *.go ./

ENTRYPOINT [ "sh", "-c", "go test -v -coverprofile=./cover.out ./... > /results/test_results.out && go tool cover -html=./cover.out -o /results/cover.html" ]

# We use alpine instead of scratch because we want to healthcheck the service port,
# and trying to get curl onto a scratch image is a pain.
FROM alpine:3.19.1

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.source="https://github.com/glizzus/discord-bigben"
LABEL org.opencontainers.image.title="discord-bigben-warehouse"
LABEL org.opencontainers.image.description="The storage service for discord-bigben"
LABEL org.opencontainers.image.revision="${GIT_HASH}"

RUN apk add --no-cache ca-certificates=20240226-r0 curl=8.5.0-r0

COPY migrations ./migrations
COPY --from=builder /app/warehouse /warehouse

ENTRYPOINT [ "/warehouse" ]
