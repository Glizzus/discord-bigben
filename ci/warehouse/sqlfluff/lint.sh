#!/bin/sh
set -e

cd "$(dirname "$0")"
export UID="$(id -u)"
export GID="$(id -g)"
docker compose up --no-color --quiet-pull
