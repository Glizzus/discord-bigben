# Infrastructure

This directory contains infrastructure code for the Big Ben Discord bot.

Included:

- [Terraform for provisioning resources](./terraform)

- [Ansible for provisioning servers](./playbooks)

- [MariaDB provisioning scripts](./mariadb)

- [MinIO provisioning scripts](./minio)

## Overview

This is the general workflow for Big Ben's infrastructure:

1. Provision resources with Terraform

    This only needs to be done initially or when resources need to be updated.

2. Use Ansible to provision servers and run deployment

    Ansible is used to install Docker and Docker Compose on the servers, as well as deploy the Big Ben services.

    It requires an `.env.prod` file to be present in the top-level directory.

    This file should not be committed to the repository.

    The deployment will automatically apply the MariaDB and MinIO provisioning scripts.
