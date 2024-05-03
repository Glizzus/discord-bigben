# Big Ben

A discord bot that plays any noise at a specific cron interval.

## Bot Permissions

| General Permissions | Text Permissions | Voice Permissions |
| -------------------- | ---------------- | ------------------ |
|                      | Use Slash Commands | Connect            |
|                      |                    | Speak              |
|                      |                    | Mute Members |

## Terminology

- `SoundCron`: A cron job that plays a sound at a specific time.

## Architecture

The bot is split into three services:

- [`campa`](campa/README.md): The orchestrator service, responsible for managing persistent data and scheduling sound crons.

Campa is short for _campanologist_, which is a person who studies and rings bells.

- [`chimer`](chimer/README.md): The sound player service, responsible for playing sounds.

The reason for splitting the bot into two services is to allow for easy scaling of the sound player service.

This is because the sound player service is the most resource-intensive part of the bot.

- [`warehouse`](warehouse/README.md): The audio storage service, responsible for storing and streaming audio files.

The warehouse is its own service to allow for easy integration with other services.

By segregating warehouse, no other service needs knowledge of the storage backend.

## Development

### Prerequisites

Because BigBen is three services, we need to run all three. We will use `docker-compose` to do this.

```bash
docker-compose up --build
```