
export GIT_HASH ?= $(shell git rev-parse --short HEAD)
export BUILD_TIME ?= $(shell date --rfc-3339=seconds)

.PHONY: build push publish

build:
	docker compose -f docker-compose.publish.yml build

push:
	docker compose -f docker-compose.publish.yml push

publish: build push
