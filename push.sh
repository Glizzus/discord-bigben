#!/bin/sh

# These are the versions of the images we are going to build and push.
# This script is the source of truth for the versions of the images.
# When you bump the version of an image, do it by changing the value here.

export CAMPA_VERSION=1.0.0
export CHIMER_VERSION=1.0.0
export WAREHOUSE_VERSION=1.0.0

export FLYWAY_VERSION=3.0.0

export MINIO_SETUP_VERSION=1.0.0
export MARIADB_SETUP_VERSION=1.0.0

export BUILD_TIME=$(date --iso-8601=seconds)
export GIT_HASH=$(git rev-parse HEAD)

docker compose build --quiet
docker compose push --quiet
