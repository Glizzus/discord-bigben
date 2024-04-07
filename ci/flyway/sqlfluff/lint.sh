#!/bin/sh
set -e

cd "$(dirname "$0")"
export USER="$(id -u):$(id -g)"
docker compose up --no-color --quiet-pull
