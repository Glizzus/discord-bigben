import type mariadb from "mariadb";
import { type SoundCron } from ".";
import { debugLogger } from "./logging";

export type WithServerId<T> = T & { serverId: string };
export type GroupedSoundCronRow = Omit<SoundCron, "excludeChannels"> & {
  excludeChannels: string;
};

export interface SoundCronRepo {
  addCron: (serverId: string, soundCron: SoundCron) => Promise<void>;
  removeCron: (serverId: string, name: string) => Promise<void>;

  getCron: (serverId: string, name: string) => Promise<SoundCron>;
  listCrons: (serverId: string) => Promise<SoundCron[]>;
  listAllCrons: () => Promise<Record<string, SoundCron[]>>;
}

export class MariaDbSoundCronRepo implements SoundCronRepo {
  constructor(private readonly pool: mariadb.Pool) {}

  async addCron(serverId: string, soundCron: SoundCron): Promise<void> {
    const logHelp = (message: string): void => {
      debugLogger(
        `MariaDbSoundCronRepo addCron ${serverId}:${soundCron.name}: ${message}`,
      );
    };

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      logHelp("Transaction started");

      // 1. Create the server in the servers table if it doesn't exist
      const insertServerQuery =
        "INSERT IGNORE INTO servers (serverId) VALUES (?)";
      logHelp(`Ensuring server ${serverId} exists`);
      await conn.query(insertServerQuery, [serverId]);

      // 2. Insert the soundCron itself
      const insertSoundCronQuery =
        "INSERT INTO soundCrons (serverId, name, cron, audio, mute, description) VALUES (?, ?, ?, ?, ?, ?)";
      const { name, cron, audio, mute, description } = soundCron;
      const params = [serverId, name, cron, audio, mute ?? false, description];
      logHelp(`Inserting row with params: ${params.toString()}`);
      const { insertId } = await conn.query(insertSoundCronQuery, params);
      logHelp(`Inserted row with id ${insertId}`);

      // 3. Insert the excluded channels
      if (soundCron.excludeChannels !== undefined) {
        const insertExcludeChannelsQuery =
          "INSERT INTO excludedChannels (soundCronId, channelId) VALUES (?, ?)";
        logHelp(
          `Inserting ${soundCron.excludeChannels.length} excluded channels`,
        );
        for (const channelId of soundCron.excludeChannels) {
          logHelp(`Inserting excluded channel ${channelId}`);
          await conn.query(insertExcludeChannelsQuery, [insertId, channelId]);
        }
      }
      await conn.commit();
      logHelp("Transaction committed");
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  async removeCron(serverId: string, name: string): Promise<void> {
    const logHelp = (message: string): void => {
      debugLogger(
        `MariaDbSoundCronRepo removeCron ${serverId}:${name}: ${message}`,
      );
    };

    const conn = await this.pool.getConnection();
    try {
      logHelp("Beginning to remove soundCron");
      const query = "DELETE FROM soundCrons WHERE serverId = ? AND name = ?";
      await conn.query(query, [serverId, name]);
      logHelp("Deleted soundCron");
    } finally {
      await conn.release();
    }
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    const conn = await this.pool.getConnection();
    try {
      /* This query uses GROUP_CONCAT to concatenate all the
      excluded channels into a single, comma-separated string. */
      type GroupedSoundCronRow = Omit<SoundCron, "excludeChannels"> & {
        excludeChannels: string;
      };
      const query = `
        SELECT sc.name, sc.cron, sc.audio, sc.mute, sc.description,
        GROUP_CONCAT(ec.channelId) AS excludeChannels
        FROM soundCrons sc
        LEFT JOIN excludedChannels ec ON sc.soundCronId = ec.soundCronId
        WHERE sc.serverId = ?
        GROUP BY sc.soundCronId`;
      const rows = await conn.query<GroupedSoundCronRow[]>(query, [serverId]);
      return rows.map((row) => {
        return {
          ...row,
          // Split the excludeChannels string into an array, remove any empty strings
          excludeChannels:
            row.excludeChannels?.split(",").filter(Boolean) ?? [],
        };
      });
    } finally {
      await conn.release();
    }
  }

  async getCron(serverId: string, name: string): Promise<SoundCron> {
    const conn = await this.pool.getConnection();
    try {
      const query =
        "SELECT name, cron, audio, mute, description FROM soundCrons WHERE serverId = ? AND name = ?";
      const rows = await conn.query<GroupedSoundCronRow[]>(query, [
        serverId,
        name,
      ]);
      if (rows.length === 0) throw new Error("Soundcron not found");
      if (rows.length > 1) {
        throw new Error("Multiple soundcrons found - this is bad");
      }
      const row = rows[0];
      return {
        ...row,
        excludeChannels: row.excludeChannels?.split(",").filter(Boolean) ?? [],
      };
    } finally {
      await conn.release();
    }
  }

  async listAllCrons(): Promise<Record<string, SoundCron[]>> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
        SELECT serverId, name, cron, audio, mute, description,
        GROUP_CONCAT(ec.channelId) AS excludeChannels
        FROM soundCrons sc
        LEFT JOIN excludedChannels ec ON sc.soundCronId = ec.soundCronId
        GROUP BY sc.soundCronId`;
      const rows =
        await conn.query<Array<WithServerId<GroupedSoundCronRow>>>(query);
      const result: Record<string, SoundCron[]> = {};
      for (const row of rows) {
        // We will just cast here. If an invalid serverId made it into the database, we have bigger problems.
        const serverId = row.serverId;
        if (result[serverId] === undefined) {
          result[serverId] = [];
        }
        result[serverId].push({
          ...row,
          excludeChannels:
            row.excludeChannels?.split(",").filter(Boolean) ?? [],
        });
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
