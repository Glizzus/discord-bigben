#!/bin/sh
set -e

cd "$(dirname "$0")"

# write stderr to a file
docker compose up --no-color --quiet-pull 2> ./
