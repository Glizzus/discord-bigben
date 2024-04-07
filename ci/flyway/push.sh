#!/bin/sh
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <flyway_docker_image>"
    exit 1
fi

date="$(date -u "+%Y-%m-%dT%H-%M-%SZ")"
release_image="ghcr.io/glizzus/bigben/flyway:${date}"
docker tag "$1" "$release_image"
docker push "$release_image"
