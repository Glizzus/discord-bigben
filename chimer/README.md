# Chimer

Chimer is the worker service for the Bigben Discord bot. It is reponsible for handling
voice connections, and playing audio files.

It is implemented via BullMQ Workers, and is designed to be horizontally scalable.

## Why Chimer?

When a user requests an audio file to be played, the Bigben Discord bot needs to connect to a voice channel, and play the audio file.

Streaming is a CPU-intensive operation, and since the bot plays sounds according to cron intervals, it means that usage will spike at certain times of the day.

Chimer is designed to handle this load by being lightweight and horizontally scalable.

## Integration with BigBen Services

- **Warehouse**: Streams audio files directly from Warehouse.

- **Campa**: Receives jobs from Campa to play audio files.

## Configuration

- `CHIMER_DISCORD_TOKEN`: The Discord bot token.

- `CHIMER_REDIS_HOST`: The host of the Redis server used by BullMQ.

- `CHIMER_REDIS_PORT`: The port of the Redis server used by BullMQ. Defaults to `6379`.

- `CHIMER_WAREHOUSE_ENDPOINT`: The endpoint of the Warehouse service.
