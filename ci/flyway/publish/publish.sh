#!/bin/sh
set -e
cd "$(dirname "$0")"

date="$(TZ=UTC date --rfc-3339=seconds)"
export DATE="$date"

git_hash="$(git rev-parse HEAD)"
export GIT_HASH="$git_hash"

docker compose build --push
