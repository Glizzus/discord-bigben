#!/bin/sh
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <flyway_docker_image>"
    exit 1
fi

export FLYWAY_IMAGE="$1"
docker compose up --no-color --quiet-pull --exit-code-from flyway
