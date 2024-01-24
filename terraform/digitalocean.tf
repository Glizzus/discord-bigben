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

variable "debug" {
    type = bool
    default = false
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
        digitalocean_droplet.bigben_droplet.urn,
        digitalocean_spaces_bucket.bigben.urn,
    ]
}

resource "digitalocean_spaces_bucket" "bigben" {
    name = "bigben"
    region = "nyc3"
    acl = "public-read"
}

locals {
    mp3_name = regex("/([^/]+)$", var.bigben_audio_file)[0]
}

resource "digitalocean_spaces_bucket_object" "seeded_mp3" {
    bucket = digitalocean_spaces_bucket.bigben.name
    region = digitalocean_spaces_bucket.bigben.region
    key = local.mp3_name
    source = var.bigben_audio_file
    acl = "public-read"
}

locals {
    mp3_bucket_url = "${digitalocean_spaces_bucket.bigben.bucket_domain_name}/${digitalocean_spaces_bucket_object.seeded_mp3.key}"
}

variable public_key_path {
    type = string
    default = "~/.ssh/bigben.pub"
}

variable private_key_path {
    type = string
    default = "~/.ssh/bigben"
}

resource "digitalocean_ssh_key" "bigben_pub_key" {
    name = "bigben"
    public_key = file(var.public_key_path)
}

resource "digitalocean_droplet" "bigben_droplet" {
  # We need to use Debian 11 because MongoDB doesn't support Debian 12 yet
  image  = "debian-11-x64"
  size = "s-1vcpu-1gb"
  name =  "bigben"
  region = "nyc1"
  monitoring = true
  ssh_keys = [
    digitalocean_ssh_key.bigben_pub_key.id
  ]

  connection {
    host = self.ipv4_address
    user = "root"
    type = "ssh"
    private_key = file(var.private_key_path)
    timeout = "2m"
  }
}

resource "digitalocean_firewall" "bigben_firewall" {
    name = "bigben-firewall"
    droplet_ids = [
        digitalocean_droplet.bigben_droplet.id
    ]

    inbound_rule {
        protocol = "tcp"
        port_range = "22"
        source_addresses = ["0.0.0.0/0", "::/0"]
    }

    inbound_rule {
        protocol = "tcp"
        port_range = "80"
        source_addresses = ["153.33.0.159"]
    }

    outbound_rule {
        protocol = "tcp"
        port_range = "1-65535"
        destination_addresses = ["0.0.0.0/0", "::/0"]
    }

    outbound_rule {
        protocol = "udp"
        port_range = "1-65535"
        destination_addresses = ["0.0.0.0/0", "::/0"]
    }
}

output "bigben_audio_file" {
    value = "https://${local.mp3_bucket_url}"
}

output "droplet_ip" {
    value = digitalocean_droplet.bigben_droplet.ipv4_address
}