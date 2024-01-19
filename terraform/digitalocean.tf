terraform {
    required_providers {
        digitalocean = {
            source = "digitalocean/digitalocean"
            version = "~> 2.0"
        }
    }
}

variable "do_token" {
    type = string
}

variable "bigben_audio_file" {
    type = string
}

variable "bigben_token" {
    type = string
    sensitive = true
}

variable "bigben_guild_id" {
    type = string
    sensitive = true
}

variable "do_spaces_access_id" {
    description = "DigitalOcean Spaces access ID"
    type = string
    sensitive = true
}

variable "do_spaces_secret_key" {
    description = "DigitalOcean Spaces secret key"
    type = string
    sensitive = true
}

provider "digitalocean" {
    token = var.do_token

    spaces_access_id = var.do_spaces_access_id
    spaces_secret_key = var.do_spaces_secret_key
}

resource "digitalocean_project" "bigben" {
    name = "bigben"
    description = "Discord bot that plays Big Ben chimes on the hour"
    environment = "Production"

    resources = [
        digitalocean_app.bigben_service.urn,
        digitalocean_spaces_bucket.bigben.urn,
    ]
}

resource "digitalocean_spaces_bucket" "bigben" {
    name = "bigben"
    region = "nyc3"
}

resource "digitalocean_spaces_bucket_object" "bigben_mp3" {
    bucket = digitalocean_spaces_bucket.bigben.name
    region = digitalocean_spaces_bucket.bigben.region
    key = "bigben.mp3"
    source = var.bigben_audio_file
}

locals {
    mp3_bucket_url = "${digitalocean_spaces_bucket.bigben.bucket_domain_name}/${digitalocean_spaces_bucket_object.bigben_mp3.key}"
}

resource "digitalocean_app" "bigben_service" {
    spec {
        name = "bigben"
        region = "nyc1"

        service {
            name = "bigben"

            dockerfile_path = "./Dockerfile"
           
            run_command = "node index.js schedule --cron '* * * * *'"

            github {
                repo = "Glizzus/discord-bigben"
                branch = "main"
                deploy_on_push = true
            }

            env {
                key = "BIGBEN_AUDIO_FILE"
                value = "https://${local.mp3_bucket_url}"
                scope = "RUN_TIME"
                type = "GENERAL"
            }

            env {
                key = "BIGBEN_TOKEN"
                value = var.bigben_token
                scope = "RUN_TIME"
                type = "SECRET"
            }

            env {
                key = "BIGBEN_GUILD_ID"
                value = var.bigben_guild_id
                scope = "RUN_TIME"
                type = "SECRET"
            }
        }
    }
}
