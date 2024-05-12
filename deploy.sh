#!/bin/sh

source versions.sh

docker compose --env-file .env.prod up --detach
