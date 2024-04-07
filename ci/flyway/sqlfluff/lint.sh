#!/bin/sh
set -e

file="ci/flyway/sqlfluff/docker-compose.yml"
docker compose --file "$file" up --no-color --quiet-pull
