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

The bot is split into two services:

- `campa`: The orchestrator service, responsible for managing persistent data and scheduling sound crons.

Campa is short for _campanologist_, which is a person who studies and rings bells.

- `chimer`: The sound player service, responsible for playing sounds.

The reason for splitting the bot into two services is to allow for easy scaling of the sound player service.

This is because the sound player service is the most resource-intensive part of the bot.
