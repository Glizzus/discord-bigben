# Warehouse Audio Storage

Warehouse is a lightweight audio storage service designed for the BigBen Discord bot.

It handles fetching, storing, and streaming of audio files.

## Why Golang?

The rest of the BigBen services are written in Node.js, but we chose to write Warehouse in Golang for a few reasons:

- **Performance**: Warehouse does a lot of streaming, and Golang's performance is better than Node.js for this use case.

- **Minio SDK**: The Minio SDK for Golang is one of, if not the best SDK for Minio. It is well-documented and easy to use.

## Why Warehouse?

When a user uploads a file to Discord, the file is stored on Discord's CDN.

It is soon deleted, meaning that the intended use case is to quickly download the file from Discord's CDN and then store it in a more permanent location.

Warehouse is designed to be that more permanent location.

It also abstracts away the storage backend, meaning that other services like **Campa** and **Chimer** can retrieve audio files from Warehouse without needing to know the specifics of the storage backend.

## Integration with BigBen Services

- **Campa**: Requests Warehouse to fetch audio files from URLs and then stores the audio files in Warehouse.

- **Chimer**: Streams audio files directly from Warehouse.

## Configuration

## Minio Storage Backend

- `WAREHOUSE_MINIO_ENDPOINT`: The endpoint of the Minio storage backend.

- `WAREHOUSE_MINIO_ACCESS_KEY`: The access key for the Minio storage backend.

- `WAREHOUSE_MINIO_SECRET_KEY`: The secret key for the Minio storage backend.`

## MariaDB Database

- `WAREHOUSE_MARIADB_HOST`: The host of the MariaDB database.

- `WAREHOUSE_MARIADB_PORT`: The port of the MariaDB database.

- `WAREHOUSE_MARIADB_USER`: The user of the MariaDB database.

- `WAREHOUSE_MARIADB_PASSWORD`: The password of the MariaDB database.

- `WAREHOUSE_MARIADB_DATABASE`: The name of the MariaDB database.

## Server

- `WAREHOUSE_PORT`: (Optional) The port on which the Warehouse service should listen. Defaults to `10002`.

- `WAREHOUSE_HOST`: (Optional) The host on which the Warehouse service should listen. Defaults to `localhost`.

## API

### `POST /soundcron/<guildID>/<audioURL>`

- **Description**: Fetches an audio file from a URL and stores it in the storage backend.
- **Parameters**:
  - `guildID`: The ID of the guild to which the audio file belongs.
  - `audioURL`: The path-encoded URL of the audio file to fetch.
- **Response**:
  - `201 Created`: The audio file was successfully fetched and stored.
    - Content-Type: `application/json`
    - Body:

      ```json
      {
        "remainingStorage": <remaining storage in bytes>
      }
      ```

  - `400 Bad Request`: The request had invalid parameters.
    - Content-Type: `text/plain`
    - Body: The error message.

  - `500 Internal Server Error`: An error occurred while fetching and storing the audio file.
    - Content-Type: `text/plain`
    - Body: The error message.

  - `507 Insufficient Storage`: The storage backend does not have enough space to store the audio file.
    - Content-Type: `application/json`
    - Body:

      ```json
      {
        "available": <available space in bytes>,
        "required": <required space in bytes>
      }
      ```

### `GET /soundcron/<guildID>/<audioURL>`

- **Description**: Streams an audio file from the storage backend.
- **Parameters**:
  - `guildID`: The ID of the guild to which the audio file belongs.
  - `audioURL`: The path-encoded URL of the audio file to stream.
- **Response**:
  - `200 OK`: The audio file was successfully streamed.
  - `500 Internal Server Error`: An error occurred while streaming the audio file.

### `DELETE /soundcron/<guildID>/<audioURL>`

- **Description**: Deletes an audio file from the storage backend.
- **Parameters**:
  - `guildID`: The ID of the guild to which the audio file belongs.
  - `audioURL`: The path-encoded URL of the audio file to delete.
- **Response**:
  - `200 OK`: The audio file was successfully deleted.
    - Content-Type: `text/plain`
    - Body: `OK`
  - `500 Internal Server Error`: An error occurred while deleting the audio file.

### `GET /health`

- **Description**: Health check endpoint.
- **Response**:
  - `200 OK`
    - Content-Type: `text/plain`
    - Body: `OK`
