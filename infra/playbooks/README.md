# Ansible

The ansible playbooks for provisioning servers and deploying the Big Ben services.

## Pre-requisites

Before running the playbooks, Terraform must be used to provision the necessary resources.

This is because Terraform creates the `hosts.ini` file that is used by Ansible.

## Usage

1. Install the required roles with:

    ```bash
    ansible-galaxy install -r requirements.yml
    ```

2. Create an `env.prod` file in the top-level directory.

    It should follow the format of `env.template`.

3. Run the playbooks with:

    ```bash
    ansible-playbook -i hosts.ini playbooks/setup.yml -u root
    ```
