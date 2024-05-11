terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "2.38.0"
    }
  }
}

variable "do_token" {
  type        = string
  sensitive   = true
  description = "DigitalOcean API token"
}

provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_volume" "minio_drive" {
  region                  = "nyc3"
  name                    = "minio-drive"
  size                    = 10
  description             = "The volume for MinIO"
  initial_filesystem_type = "xfs"
}

resource "digitalocean_volume" "mariadb_drive" {
  region                  = "nyc3"
  name                    = "maria-drive"
  size                    = 5
  description             = "The volume for MariaDB"
  initial_filesystem_type = "xfs"
}

resource "digitalocean_volume" "redis_drive" {
  region      = "nyc3"
  name        = "redis-drive"
  size        = 1
  description = "The volume for Redis"
  # We use zfs for Redis in order to maintain consistency with the other volumes.
  initial_filesystem_type = "xfs"
}

resource "digitalocean_droplet" "bigben_vm" {
  image  = "debian-12-x64"
  name   = "bigben-vm"
  region = "nyc3"
  size   = "s-1vcpu-1gb"
  volume_ids = [
    digitalocean_volume.minio_drive.id,
    digitalocean_volume.mariadb_drive.id,
    digitalocean_volume.redis_drive.id
  ]
}

resource "digitalocean_project" "bigben_project" {
  name        = "bigben"
  description = "The project for the BigBen application"
  environment = "Production"
  resources = [
    digitalocean_droplet.bigben_vm.urn,
    digitalocean_volume.minio_drive.urn,
    digitalocean_volume.mariadb_drive.urn,
    digitalocean_volume.redis_drive.urn
  ]
}

resource "local_file" "hosts" {
  content = templatefile("${path.module}/hosts.ini.tpl", {
    ip = digitalocean_droplet.bigben_vm.ipv4_address
  })
  filename = "${path.module}/../playbooks/hosts.ini"
}
