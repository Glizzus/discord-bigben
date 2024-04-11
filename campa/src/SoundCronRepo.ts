import type mariadb from "mariadb";
import { type SoundCron } from ".";
import { debugLogger } from "./logging";

type GroupedSoundCronRow = {
  soundcron_name: string;
  cron: string;
  audio: string;
  mute: boolean;
  soundcron_description: string;
  // This will be null if there are no excluded channels
  exclude_channels?: string;
}

function groupedRowToSoundCron(row: GroupedSoundCronRow): SoundCron {
  return {
    name: row.soundcron_name,
    cron: row.cron,
    audio: row.audio,
    mute: row.mute,
    description: row.soundcron_description,
    excludeChannels: row.exclude_channels?.split(",").filter(Boolean) ?? []
  };
}

/**
 * A repository for soundcrons.
 * This repository is responsible for adding, removing, and listing soundcrons.
 */
export interface SoundCronRepo {
  /**
   * Adds a soundCron for a server.
   * @param serverId the server ID for the soundCron
   * @param soundCron the data describing the soundCron
   * @returns a promise that resolves when the soundCron has been added
   */
  addCron: (serverId: string, soundCron: SoundCron) => Promise<void>;

  /**
   * Removes a soundCron from a server.
   * @param serverId the server ID for the soundCron
   * @param name the name of the soundCron to remove
   * @returns a promise that resolves when the soundCron has been removed
   */
  removeCron: (serverId: string, name: string) => Promise<void>;

  /**
   * Gets one soundCron from a server by name.
   * @param serverId the server ID for the soundCron
   * @param name the name of the soundcron to get
   * @returns a promise that resolves with the soundcron and its data
   */
  getCron: (serverId: string, name: string) => Promise<SoundCron>;

  /**
   * Lists all soundCrons for a server.
   * @param serverId the server ID for the soundCron
   * @returns a promise that resolves with an array of soundcrons for the server
   */
  listCrons: (serverId: string) => Promise<SoundCron[]>;

  /**
   * Lists all of the soundCrons for all servers.
   * This is often used for startup to load all of the soundCrons.
   * @returns a promise that resolves with a record of server IDs to soundcrons
   */
  listAllCrons: () => Promise<Record<string, SoundCron[]>>;
}

/**
 * A MariaDB implementation of the SoundCronRepo.
 */
export class MariaDbSoundCronRepo implements SoundCronRepo {
  /**
   * Constructs a new MariaDbSoundCronRepo.
   * @param pool a mariadb pool to use for database connections
   */
  constructor(private readonly pool: mariadb.Pool) {}

  async addCron(serverId: string, soundCron: SoundCron): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Create the server in the servers table if it doesn't exist
      const insertServerQuery =
        "INSERT IGNORE INTO servers (server_id) VALUES (?)";
      debugLogger(`Inserting server ${serverId} if it doesn't exist`);
      await conn.query(insertServerQuery, [serverId]);

      // 2. Insert the soundCron itself
      const insertSoundCronQuery =
        "INSERT INTO soundcrons (server_id, soundcron_name, cron, audio, mute, soundcron_description) VALUES (?, ?, ?, ?, ?, ?)";
      const { name, cron, audio, mute, description } = soundCron;
      const params = [serverId, name, cron, audio, mute ?? false, description];
      debugLogger(
        `Inserting soundCron ${serverId}:${soundCron.name} with params ${params.toString()}`,
      );
      const { insertId } = await conn.query(insertSoundCronQuery, params);
      debugLogger(
        `Inserted soundCron ${serverId}:${soundCron.name} with ID ${insertId}`,
      );

      // 3. Insert the excluded channels
      const { excludeChannels } = soundCron;
      if (excludeChannels !== undefined) {
        const insertExcludeChannelsQuery =
          "INSERT INTO excluded_channels (soundcron_id, channel_id) VALUES (?, ?)";
        debugLogger(
          `Inserting ${excludeChannels.length} excluded channels for soundCron ${serverId}:${soundCron.name}`,
        );
        for (const channelId of excludeChannels) {
          debugLogger(
            `Inserting excluded channel ${channelId} for soundCron ${serverId}:${soundCron.name}`,
          );
          await conn.query(insertExcludeChannelsQuery, [insertId, channelId]);
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  async removeCron(serverId: string, name: string): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      debugLogger(`Removing soundCron ${serverId}:${name}`);
      const query = "DELETE FROM soundcrons WHERE server_id = ? AND soundcron_name = ?";
      await conn.query(query, [serverId, name]);
    } finally {
      await conn.release();
    }
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
        SELECT sc.soundcron_name, sc.cron, sc.audio, sc.mute, sc.soundcron_description,
        GROUP_CONCAT(ec.channel_id) AS exclude_channels
        FROM soundcrons sc
        LEFT JOIN excluded_channels ec ON sc.soundcron_id = ec.soundcron_id
        WHERE sc.server_id = ?
        GROUP BY sc.soundcron_id`;
      const rows = await conn.query<GroupedSoundCronRow[]>(query, [serverId]);
      return rows.map(groupedRowToSoundCron);
    } finally {
      await conn.release();
    }
  }

  async getCron(serverId: string, name: string): Promise<SoundCron> {
    const conn = await this.pool.getConnection();
    try {
      const query =
        "SELECT soundcron_name, cron, audio, mute, soundcron_description FROM soundcrons WHERE server_id = ? AND soundcron_name = ?";
      const rows = await conn.query<GroupedSoundCronRow[]>(query, [
        serverId,
        name,
      ]);
      if (rows.length === 0) throw new Error("Soundcron not found");
      if (rows.length > 1) {
        throw new Error("Multiple soundcrons found - this is bad");
      }
      const row = rows[0];
      return groupedRowToSoundCron(row);
    } finally {
      await conn.release();
    }
  }

  async listAllCrons(): Promise<Record<string, SoundCron[]>> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
        SELECT server_id, soundcron_name, cron, audio, mute, soundcron_description,
        GROUP_CONCAT(ec.channel_id) AS exclude_channels 
        FROM soundcrons sc
        LEFT JOIN excluded_channels ec ON sc.soundcron_id = ec.soundcron_id
        GROUP BY sc.soundcron_id`;

      type WithServerId<T> = T & { server_id: string };
      const rows =
        await conn.query<Array<WithServerId<GroupedSoundCronRow>>>(query);
      const result: Record<string, SoundCron[]> = {};
      for (const row of rows) {
        // We will just cast here. If an invalid serverId made it into the database, we have bigger problems.
        const serverId = row.server_id;
        if (result[serverId] === undefined) {
          result[serverId] = [];
        }
        result[serverId].push(groupedRowToSoundCron(row));
      }
      return result;
    } finally {
      await conn.release();
    }
  }
}

export class SoundCronServiceError extends Error {
  constructor(
    message: string,
    public innerError?: Error,
  ) {
    super(message);
    this.name = "SoundCronServiceError";
    // This `captureStackTrace` method is only available in V8, which is fine since we're using Node.js.
    if (Error.captureStackTrace !== undefined) {
      Error.captureStackTrace(this, SoundCronServiceError);
    }
    this.innerError = innerError;
  }
}
