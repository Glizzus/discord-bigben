import * as bullmq from "bullmq";
import * as cronparser from "cron-parser";
import { type SoundCron } from ".";
import { type SoundCronRepo, SoundCronServiceError } from "./SoundCronRepo";
import {
  type SoundCronJobEstablished,
  type SoundCronJob,
} from "@discord-bigben/types";
import type winston from "winston";
import { type Redis } from "ioredis";
import { debugLogger } from "./logging";

type SoundCronQueue = bullmq.Queue<SoundCronJob, SoundCronJobEstablished>;

const AddCronFailureReasonMap = {
  InvalidCron: "InvalidCron",
  DatabaseError: "DatabaseError",
  QueueError: "QueueError",
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
  private readonly soundCronQueue: SoundCronQueue;

  constructor(
    private readonly soundCronRepo: SoundCronRepo,
    redis: Redis,
    private readonly logger: winston.Logger,
  ) {
    this.soundCronQueue = new bullmq.Queue("soundCron", {
      connection: redis
    });
  }

  private async enqueueCron(
    serverId: string,
    soundCron: SoundCron,
  ): Promise<void> {
    if (serverId === undefined) {
      throw new SoundCronServiceError("Server ID is undefined - refusing to enqueue soundcron");
    } else if (soundCron.name === undefined) {
      throw new SoundCronServiceError("Soundcron name is undefined (not literally) - refusing to enqueue soundcron");
    }
    const { name, timezone, cron } = soundCron;
    // This key is guaranteed to be unique by our database schema
    const jobName = `${serverId}:${soundCron.name}`;
    const jobData: SoundCronJob = {
      serverId,
      name,
      cron,
      timezone: timezone ?? "UTC",
      audio: soundCron.audio,
      mute: soundCron.mute ?? false,
      excludeChannels: soundCron.excludeChannels ?? [],
    };
    await this.soundCronQueue.add(jobName, jobData, {
      repeat: {
        pattern: cron,
        tz: timezone
      },
    });
  }

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

    // 2. Insert the cron into the database
    try {
      await this.soundCronRepo.addCron(serverId, soundCron);
    } catch (err) {
      this.logger.error(`Error adding soundcron to database: ${err}`);
      return {
        success: false,
        reason: AddCronFailureReasonMap.DatabaseError
      }
    }

    // 3. Add the cron to the queue
    try {
      await this.enqueueCron(serverId, soundCron);
    } catch (err) {
      this.logger.error(`Error adding soundcron to queue: ${err}`);
      return {
        success: false,
        reason: AddCronFailureReasonMap.QueueError
      }
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
    /* We do make 2 round trips to the database here, even though
    MariaDB makes it easy to do it in one. This is fine because
    removal is not a common operation */
    const soundCron = await this.soundCronRepo.getCron(serverId, name);

    /* In the future, we should probably return something to the caller
    indicating that this happened. It isn't an application error though,
    so an exception is not appropriate */
    if (soundCron === null) {
      this.logger.info(`Attempt to remove non-existent soundcron ${name} for server ${serverId}`);
      return;
    }

    const jobName = `${serverId}:${name}`; 
    const repeatOpts = {
      pattern: soundCron.cron,
      tz: soundCron.timezone,
    };
    /* We log heavily here because this is a critical operation.
    It would be extremely annoying to the user if they tried to remove a soundcron,
    but it kept playing because it wasn't removed from the queue */
    this.logger.info(`Removing soundcron ${jobName} from queue with repeat options ${JSON.stringify(repeatOpts)}`);
    const removedFromQueue = await this.soundCronQueue.removeRepeatable(jobName, repeatOpts);
    if (!removedFromQueue) {
      this.logger.error(`Soundcron ${jobName} indicated as not removed from queue`);
      /* We return from here because, if the job is still in the queue, we don't want to remove it from the database.
      If we remove it from the database, the user can't retry removing it from the queue when the issue is resolved */
      return;
    }

    /* At this point, we know the job was removed from the queue. It will not play.
    Even if it remains in the database, it is just a recordkeeping issue. The sound
    will not pester the user */
    await this.soundCronRepo.removeCron(serverId, name);
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    return await this.soundCronRepo.listCrons(serverId);
  }
}
