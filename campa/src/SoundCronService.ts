import * as cronparser from "cron-parser";
import { type SoundCronRepo } from "./SoundCronRepo";
import type winston from "winston";
import { SoundCron } from "./SoundCron";
import { WarehouseClient } from "./WarehouseClient";
import { debugLogger } from "./logging";
import { JobQueue } from "./JobQueue";

const AddCronFailureReasonMap = {
  InvalidCron: "InvalidCron",
} as const;

type AddCronFailureReason = typeof AddCronFailureReasonMap[keyof typeof AddCronFailureReasonMap];

export type AddCronResult = {
  success: true;
} | {
  success: false;
  reason: AddCronFailureReason;
};

/**
 * A service for managing soundcrons. This service is responsible for adding and removing soundcrons.
 * This handles data persistence and queue management.
 */
export class SoundCronService {

  constructor(
    private readonly soundCronRepo: SoundCronRepo,
    private readonly warehouseClient: WarehouseClient,
    private readonly jobQueue: JobQueue,
    private readonly logger: winston.Logger,
  ) {}

  /**
   * Adds a soundcron. This will persist the soundcron, as well as add it to the queue.
   * If this succeeds, the soundcron will be executed at the next scheduled time.
   * @param serverId the discord snowflake of the server
   * @param soundCron the soundcron and its options
   * @throws SoundCronServiceError if the soundcron is invalid or if there is an error adding it to the database or queue
   */
  async addCron(serverId: string, soundCron: SoundCron): Promise<AddCronResult> {
    /* 1. Ensure that the cron expression is valid.
    This will throw an error if it is not. */
    try {
      cronparser.parseExpression(soundCron.cron);
    } catch (err) {
      this.logger.error(`Invalid cron expression ${soundCron.cron}: ${err}`);
      return {
        success: false,
        reason: AddCronFailureReasonMap.InvalidCron
      }
    }

    const rollbacks: (() => Promise<void>)[] = [
      async () => {
        debugLogger(`Rolling back Warehouse download of audio ${soundCron.audio} for server ${serverId}`);
        await this.warehouseClient.remove(serverId, soundCron.audio);
      },
      async () => {
        debugLogger(`Rolling back database addition of soundcron ${soundCron.name} for server ${serverId}`);
        await this.soundCronRepo.removeCron(serverId, soundCron.name);
      },
      async () => {
        debugLogger(`Rolling back queue addition of soundcron ${soundCron.name} for server ${serverId}`);
        await this.jobQueue.remove(serverId, soundCron);
      },
    ];

    const warehouseDownloaded = this.warehouseClient.download(serverId, soundCron.audio);
    const addedToDatabase = this.soundCronRepo.addCron(serverId, soundCron);
    const addedToQueue = this.jobQueue.add(serverId, soundCron);

    try {
      await Promise.all([
        warehouseDownloaded,
        addedToDatabase,
        addedToQueue
      ]);
    } catch (err) {
      this.logger.error(`Error adding soundcron ${soundCron.name} for server ${serverId}: ${err}`);
      for (const rollback of rollbacks) {
        try {
          await rollback();
        } catch (rollbackErr) {
          this.logger.error(`Error rolling back soundcron: ${rollbackErr}`);
        }
      }
      throw err;
    }
 
    return {
      success: true
    }
  }

  /**
   * Removes a soundcron. This will remove the soundcron from the database and the queue.
   * If this succeeds, the soundcron will not be executed again.
   * @param serverId the discord snowflake of the server
   * @param name the name of the soundcron to remove
   * @throws SoundCronServiceError if there is an error removing the soundcron from the database or queue
   */
  async removeCron(serverId: string, name: string): Promise<void> {
    const soundCron = await this.soundCronRepo.getCron(serverId, name);

    // TODO: Indicate to the caller that this happened
    if (soundCron === null) {
      this.logger.info(`Attempt to remove non-existent soundcron ${name} for server ${serverId}`);
      return;
    }

    await this.jobQueue.remove(serverId, soundCron);
  
    /* At this point, we know the job was removed from the queue. It will not play.
    Even if we fail to remove it from the database, it will not play again */
    await Promise.all([
      this.soundCronRepo.removeCron(serverId, name),
      this.warehouseClient.remove(serverId, soundCron.audio)
    ]);
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    return await this.soundCronRepo.listCrons(serverId);
  }
}
