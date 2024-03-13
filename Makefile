
export GIT_HASH ?= $(shell git rev-parse --short HEAD)
export BUILD_TIME ?= $(shell date --rfc-3339=seconds)

.PHONY: build push publish

export CAMPA_VERSION ?= $(shell node ./scripts/getVersion.js ./campa)
export CHIMER_VERSION ?= $(shell node ./scripts/getVersion.js ./chimer)

build:
	docker compose -f docker-compose.publish.yml build

push:
	docker compose -f docker-compose.publish.yml push

publish: build push

.PHONY: deploy

deploy:
	ansible-playbook -i ansible/hosts ansible/prod.yml --extra-vars \
		"campa_version=$(CAMPA_VERSION) chimer_version=$(CHIMER_VERSION)" \
		--ask-become-pass
