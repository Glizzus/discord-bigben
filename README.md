# Big Ben

A discord bot that plays any noise at a specific cron interval.

## Bot Permissions

These are the following permissions that Big Ben requires:

| General Permissions | Text Permissions | Voice Permissions |
| -------------------- | ---------------- | ------------------ |
|                      | Use Slash Commands | Connect            |
|                      |                    | Speak              |
|                      |                    | Mute Members |

## Terminology

- `SoundCron`: A cron job that plays a sound at a specific time.

## Architecture

The bot is split into three services:

- [**Campa**](./campa): The orchestrator service.

    Campa is short for _campanologist_, which is a person who studies and rings bells.

    This reflects it's role as the orchestrator of the bot.

    Duties:
        - Persisting SoundCrons (in MariaDB)
        - Scheduling SoundCrons (via BullMQ)
        - Discord Slash Command Handling (via Discord.js)

- [**Chimer**](./chimer): The sound player service, responsible for playing sounds.

    This service is designed to be stateless and small. This makes it easy to horizontally scale.

    Duties:
        - Playing sounds at a specific time (via BullMQ)

- [**Warehouse**](./warehouse): The data storage service, responsible for storing audio files.

    Duties:
        - Downloading audio files from URLs
        - Storing audio files (in Minio)
        - Streaming audio files to Chimer
        - Enforcing storage limits per guild (via MariaDB)

## Development

To quickly get started with development, run the following command:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.override.yml up --build
```

This will start all of the services in development mode.
