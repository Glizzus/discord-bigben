# Terraform

## Overview

1. Create a `.tfvars` file with the necessary variables.

    ```hcl
    # infra/terraform/.tfvars
    do_token = "<YOUR_DIGITALOCEAN_TOKEN>"
    ```

2. Initialize Terraform.

    ```bash
    terraform init
    ```

3. Plan the infrastructure.

    ```bash
    terraform plan -var-file=".tfvars"
    ```

4. Apply the infrastructure.

    ```bash
    terraform apply -var-file=".tfvars"
    ```

This will create the following resources:

- A DigitalOcean Droplet for the Big Ben bot.

- DigitalOcean Volumes for the Data storage services.

- A `hosts.ini` file in [playbooks](../playbooks) for Ansible.
