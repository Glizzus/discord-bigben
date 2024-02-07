import { SoundCronConfig } from '../ScheduleConfig';
import * as mariadb from 'mariadb';
import { AddFailureReason, AddSoundCronError, ISoundCronRepository } from './ISoundCronRepository';
import { debugLogger } from '../debugLogger';
import { Logger } from '../Logger';

export class MariaDbSoundCronRepository implements ISoundCronRepository {

  constructor(private readonly pool: mariadb.Pool) {}

  async addSoundCrons(serverId: string, soundCrons: SoundCronConfig[]) {
    let conn: mariadb.PoolConnection | null = null;
    try {
      conn = await this.pool.getConnection();
      await conn.beginTransaction();

      // 1. Create the server if it doesn't exist
      await conn.query(
        `INSERT IGNORE INTO servers (serverId) VALUES (?)`,
        [serverId]
      );

      // 2. Insert the soundCrons and their excluded channels
      for (const cronConfig of soundCrons) {
        const { name, cron, audio, mute, description } = cronConfig;
        try {
          const insertResult = await conn.query(
            `INSERT INTO soundCrons (serverId, name, cron, audio, mute, description) VALUES (?, ?, ?, ?, ?, ?)`,
            [serverId, name, cron, audio, mute ?? false, description]
          );
          const soundCronId = insertResult.insertId;
          if (cronConfig.excludeChannels) {
            for (const channeledId of cronConfig.excludeChannels) {
              await conn.query(
                `INSERT INTO excludedChannels (soundCronId, channelId) VALUES (?, ?)`,
                [soundCronId, channeledId]
              );
            }
          }
        } catch (err) {
          if (err instanceof mariadb.SqlError && err.code === 'ER_DUP_ENTRY') {
            throw new AddSoundCronError(`SoundCron with name ${name} already exists`, AddFailureReason.AlreadyExists);
          }
          Logger.error("Failed to add soundCron for unknown reason:", err);
          throw new AddSoundCronError(`Error adding soundCron with name ${name}`, AddFailureReason.Unknown);
        }
      }
      await conn.commit();
    } catch (err) {
      if (conn) {
        await conn.rollback();
      }
      throw err;
    } finally {
      if (conn) {
        await conn.release();
      }
    }
  }

  async deleteSoundCronByName(serverId: string, name: string) {
    const conn = await this.pool.getConnection();
    try {
      const { affectedRows } = await conn.query<{ affectedRows: number }>(
        `DELETE FROM soundCrons WHERE serverId = ? AND name = ?`,
        [serverId, name]
      );
      return affectedRows;
    } finally {
      await conn.release();
    }
  }

  async *getAllServerSoundCrons(serverId: string): AsyncIterable<SoundCronConfig> {
    debugLogger(`Getting all soundCrons for server ${serverId}`);
    const conn = await this.pool.getConnection();
    try {
      const stream = conn.queryStream(
        `SELECT * FROM soundCrons WHERE serverId = ?`,
        [serverId]
      );
      for await (const row of stream) {
        yield row as SoundCronConfig;
      }
    } finally {
      await conn.release();
    }
  }

  async *getAllSoundCrons(): AsyncIterable<[string, SoundCronConfig]> {
    const conn = await this.pool.getConnection();
    try {
      const stream = conn.queryStream(
        `SELECT * FROM soundCrons`
      );
      for await (const row of stream) {
        const serverId: string = row.serverId;
        const soundCron = row as SoundCronConfig;
        yield [serverId, soundCron]
      }
    } finally {
      await conn.release();
    }
  }
}