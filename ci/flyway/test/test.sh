#!/bin/sh
set -e

if [ -z "$FLYWAY_IMAGE" ]; then
  echo "FLYWAY_IMAGE is not set. This should be set from a previous step."
  exit 1
fi

docker compose up --no-color --quiet-pull --exit-code-from flyway
