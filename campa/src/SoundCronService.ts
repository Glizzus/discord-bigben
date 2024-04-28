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

type SoundCronQueue = bullmq.Queue<SoundCronJob, SoundCronJobEstablished>;

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
  async addCron(serverId: string, soundCron: SoundCron): Promise<void> {
    const baseErrorMessage = `Unable to add soundcron ${soundCron.name} for server ${serverId}`;

    // 1. Ensure that the cron expression is valid
    try {
      cronparser.parseExpression(soundCron.cron);
    } catch (err) {
      if (err instanceof Error) {
        throw new SoundCronServiceError(
          `${baseErrorMessage}: Invalid cron expression`,
          err,
        );
      }
    }

    // 2. Insert the cron into the database
    try {
      await this.soundCronRepo.addCron(serverId, soundCron);
    } catch (err) {
      if (err instanceof Error) {
        throw new SoundCronServiceError(
          `${baseErrorMessage}: Unable to add to database`,
          err,
        );
      }
    }

    // 3. Add the cron to the queue
    try {
      await this.enqueueCron(serverId, soundCron);
    } catch (err) {
      if (err instanceof Error) {
        throw new SoundCronServiceError(
          `${baseErrorMessage}: Unable to add to queue`,
          err,
        );
      }
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
    const removedFromQueue = this.soundCronQueue.removeRepeatable(jobName, {
      pattern: soundCron.cron,
      tz: soundCron.timezone,
    });

    const removedFromDatabase = this.soundCronRepo.removeCron(serverId, name);
  
    /* We run these two in tandem for two reasons:
    1. Performance (minor)
    2. Even if one fails, we would hope the other would succeed */
    await Promise.all([removedFromQueue, removedFromDatabase]);
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    return await this.soundCronRepo.listCrons(serverId);
  }
}
