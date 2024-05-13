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

- [**Campa**](./campa): The orchestrator service, responsible for managing persistent data and scheduling sound crons.

    Campa is short for _campanologist_, which is a person who studies and rings bells.

- [**Chimer**](./chimer): The sound player service, responsible for playing sounds.

    The reason for splitting the bot into two services is to allow for easy scaling of the sound player service.

    This is because the sound player service is the most resource-intensive part of the bot.

- [**Warehouse**](./warehouse): The data storage service, responsible for storing persistent data.

    The reason for splitting the bot into three services is to allow for easy scaling of the data storage service.

    This is because the data storage service is the most resource-intensive part of the bot.

## Development

To quickly get started with development, run the following command:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.override.yml up --build
```

This will start all of the services in development mode.
