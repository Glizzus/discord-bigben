# Campa

Campa is the controller service for the Bigben Discord bot.

It is responsible for user interactions, database operations, and managing the job queue.

For our database, we use MariaDB. For our job queue, we use BullMQ backed by Redis.

## Why Campa?

There are two high level things the Bigben bot needs to do:

1. Manage user interactions, data persistence, and job scheduling.

2. Play audio files.

The first part is complicated and memory-intensive, while the second part is simple and CPU-intensive.

Campa is designed to handle the first part, while Chimer is designed to handle the second part.

By allowing Campa to take on every function except for streaming, we make it easy to scale the streaming aspect of the bot.

## Integration with BigBen Services

- **Warehouse**: Requests Warehouse to fetch audio files from URLs and then stores the audio files in Warehouse.

- **Chimer**: Sends jobs to Chimer to play audio files.

## Configuration

- `MARIADB_URI`: The URI of the MariaDB database.

- `REDIS_HOST`: The host of the Redis server used by BullMQ.

- `REDIS_PORT`: The port of the Redis server used by BullMQ. Defaults to `6379`.

- `CLIENT_ID`: The Discord bot client ID.

- `DISCORD_TOKEN`: The Discord bot token.

- `CAMPA_WAREHOUSE_ENDPOINT`: The endpoint of the Warehouse service.
