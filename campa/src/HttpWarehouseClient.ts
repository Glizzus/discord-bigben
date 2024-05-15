import { WarehouseClient } from "./WarehouseClient";

/**
 * An HTTP client for the Warehouse service.
 * This client is used to download and remove audio files from the Warehouse service.
 */
export class HttpWarehouseClient implements WarehouseClient {

  constructor(private readonly endpoint: string) {}

  /**
   * Instructs the Warehouse service to download an audio file.
   * This will download the audio file to the Warehouse service.
   * @param serverId the discord snowflake of the server
   * @param audioUrl the URL of the audio file to download
   */
  async download(serverId: string, audioUrl: string): Promise<void> {
    const endpoint = `${this.endpoint}/soundcron/${serverId}/${encodeURIComponent(audioUrl)}`;
    await fetch(endpoint, { method: "POST", headers: { "Content-Length": "0" } });
  }

  /**
   * Instructs the Warehouse service to remove an audio file.
   * This will remove the audio file from the Warehouse service.
   * @param serverId the discord snowflake of the server
   * @param audioUrl the URL of the audio file to remove
   */
  async remove(serverId: string, audioUrl: string): Promise<void> {
    const endpoint = `${this.endpoint}/soundcron/${serverId}/${encodeURIComponent(audioUrl)}`;
    await fetch(endpoint, { method: "DELETE" });
  }
}
