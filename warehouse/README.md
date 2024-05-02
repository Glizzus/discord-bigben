# Warehouse Audio Storage

Warehouse is a lightweight audio storage service designed for the BigBen Discord bot.

It handles fetching, storing, and streaming of audio files.

## Why Warehouse?

When a user uploads a file to Discord, the file is stored on Discord's CDN.

It is soon deleted, meaning that the intended use case is to quickly download the file from Discord's CDN and then store it in a more permanent location.

Warehouse is designed to be that more permanent location.

It also abstracts away the storage backend, meaning that other services like **Campa** and **Chimer** can retrieve audio files from Warehouse without needing to know the specifics of the storage backend.

## Integration with BigBen Services

- **Campa**: Requests Warehouse to fetch audio files from URLs and then stores the audio files in Warehouse.

- **Chimer**: Streams audio files directly from Warehouse.

## Configuration

- `WAREHOUSE_MINIO_ENDPOINT`: The endpoint of the Minio storage backend.

- `WAREHOUSE_MINIO_ACCESS_KEY`: The access key for the Minio storage backend.

- `WAREHOUSE_MINIO_SECRET_KEY`: The secret key for the Minio storage backend.`

- `WAREHOUSE_PORT`: (Optional) The port on which the Warehouse service should listen. Defaults to `10002`.

- `WAREHOUSE_HOST`: (Optional) The host on which the Warehouse service should listen. Defaults to `localhost`.

## API

### `POST /audio/<audioURL>`
- **Description**: Fetches an audio file from a URL and stores it in the storage backend.
- **Parameters**:
  - `audioURL`: The path-encoded URL of the audio file to fetch.
- **Response**:
    - `200 OK`: The audio file was successfully fetched and stored.
    - `500 Internal Server Error`: An error occurred while fetching and storing the audio file.

### `GET /audio/<audioURL>`
- **Description**: Streams an audio file from the storage backend.
- **Parameters**:
  - `audioURL`: The path-encoded URL of the audio file to stream.
- **Response**:
    - `200 OK`: The audio file was successfully streamed.
    - `500 Internal Server Error`: An error occurred while streaming the audio file.

### `DELETE /audio/<audioURL>`
- **Description**: Deletes an audio file from the storage backend.
- **Parameters**:
  - `audioURL`: The path-encoded URL of the audio file to delete.
- **Response**:
    - `200 OK`: The audio file was successfully deleted.
    - `500 Internal Server Error`: An error occurred while deleting the audio file.

### `GET /health`
- **Description**: Health check endpoint.
- **Response**:
    - `200 OK`
