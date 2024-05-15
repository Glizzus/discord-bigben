#!/bin/sh
set -e

# Navigate to the directory of the script where docker-compose.yml is located
cd "$(dirname "$0")"

date="$(date -u "+%Y-%m-%dT%H-%M-%SZ")"
export BUILD_DATE="$date"

git_hash="$(git rev-parse HEAD)"
export GIT_HASH="$git_hash"

docker compose build --quiet

echo "ghcr.io/glizzus/bigben/warehouse:build-${date}"
