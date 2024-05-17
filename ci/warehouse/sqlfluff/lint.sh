#!/bin/sh
set -e

cd "$(dirname "$0")"

UID=$(id -u) \
GID=$(id -g) \
docker compose up --no-color --quiet-pull
