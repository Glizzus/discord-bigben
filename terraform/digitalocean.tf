terraform {
    required_providers {
        digitalocean = {
            source = "digitalocean/digitalocean"
            version = "~> 2.0"
        }
    }
}

variable "do_token" {}

provider "digitalocean" {
    token = var.do_token
}

resource "digitalocean_app" "bigben-function" {
    spec {
        name = "bigben"
        region = "nyc1"

        function {
            name = "bigben"
            git {
                repo_clone_url = "https://github.com/Glizzus/discord-bigben.git"
                branch = "main"
            }
        }

    }
}