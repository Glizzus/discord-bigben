#!/bin/bash

source versions.sh

docker compose --env-file .env.prod \
    --file docker-compose.yml \
    --file docker-compose.prod.override.yml \
    up --detach
