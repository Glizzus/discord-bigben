import * as bullmq from "bullmq";
import * as cronparser from "cron-parser";
import { type SoundCron } from ".";
import { type SoundCronRepo, SoundCronServiceError } from "./SoundCronRepo";
import {
  type SoundCronJobEstablished,
  type SoundCronJob,
} from "@discord-bigben/types";
import { type UUID } from "crypto";
import { type WorkerRecordRepo } from "./WorkerRecordRepo";
import type winston from "winston";
import { type Redis } from "ioredis";
import { debugLogger } from "./logging";

type SoundCronQueue = bullmq.Queue<SoundCronJob, SoundCronJobEstablished>;

/**
 * A service for managing soundcrons. This service is responsible for adding and removing soundcrons.
 * This handles data persistence and queue management.
 */
export class SoundCronService {
  private readonly soundCronQueue: SoundCronQueue;

  constructor(
    private readonly workerMapRepo: WorkerRecordRepo,
    private readonly soundCronRepo: SoundCronRepo,
    private readonly redis: Redis,
    private readonly logger: winston.Logger,
  ) {
    this.soundCronQueue = new bullmq.Queue("soundCron", {
      connection: redis,
    });

    /* We set up an event listener for when a soundcron job is sent. This
    lets us know that we expect it to be alive, and we start listening for
    heartbeats. */
    new bullmq.QueueEvents("soundCron", {
      connection: redis,
    }).on("completed", async (job) => {
      const retrievedJob = await bullmq.Job.fromId<
        SoundCronJob,
        SoundCronJobEstablished
      >(this.soundCronQueue, job.jobId);
      if (retrievedJob === undefined) {
        this.logger.warn(
          `Job ${job.jobId} completed, but could not be retrieved from the queue. This is unusual.`,
        );
        return;
      }
      const { workerId, key } = retrievedJob.returnvalue;
      await this.workerMapRepo.addWorkerRecord(workerId, key);
      const heartbeatInterval = 10000;
      const timeout = setInterval(async () => {
        if (await this.checkWorkerAlive(workerId)) {
          debugLogger(`Worker ${workerId} is alive`);
          return;
        }
        this.logger.warn(
          `Worker ${workerId} has died. Attempting to resurrect jobs`,
        );
        await this.resurrectSoundCronsForWorker(workerId);
        /* We assume that the resurrection works the first time. If it doesn't,
        then the user will have to manually restart the soundcron. */
        clearInterval(timeout);
      }, heartbeatInterval);
    });
  }

  private async checkWorkerAlive(workerId: UUID): Promise<boolean> {
    const exists = await this.redis.exists(`heartbeat:${workerId}`);
    return exists === 1;
  }

  private async resurrectSoundCronsForWorker(workerId: UUID): Promise<void> {
    const keys = await this.workerMapRepo.retrieveWorkerRecords(workerId);
    await Promise.all(
      keys.map(async (key) => {
        // We want as many of these to succeed as possible, so we catch and log errors.
        try {
          const [serverId, name] = key.split(":", 2);
          const soundCron = await this.soundCronRepo.getCron(serverId, name);
          if (soundCron === null) {
            const message = `Somehow there was a worker record for a soundcron that doesn't exist in the database: ${key}`;
            this.logger.warn(message);
            return;
          }
          await this.enqueueCron(serverId, soundCron);
        } catch (err) {
          if (err instanceof Error) {
            this.logger.error(
              `Error resurrecting soundcron ${key} for worker ${workerId}`,
              err,
            );
          } else {
            this.logger.error(
              `Unknown error resurrecting soundcron ${key} for worker ${workerId} - error is not an instance of Error`,
            );
          }
        }
      }),
    );
  }

  private async enqueueCron(
    serverId: string,
    soundCron: SoundCron,
  ): Promise<void> {
    // This key is guaranteed to be unique by our database schema
    const key = `${serverId}:${soundCron.name}`;
    const jobData: SoundCronJob = {
      serverId,
      name: soundCron.name,
      cron: soundCron.cron,
      timezone: soundCron.timezone ?? "UTC",
      audio: soundCron.audio,
      mute: soundCron.mute ?? false,
      excludeChannels: soundCron.excludeChannels ?? [],
    };
    await this.soundCronQueue.add(key, jobData);
    await this.workerMapRepo.addUnassigned(key);
  }

  /**
   * Starts all soundcrons. This will add all soundcrons to the queue.
   * It does not write or modfiy any soundcrons in the database.
   * It is recommended to only call this on startup. Every new soundcron
   * will be added to the queue when it is added to the database with `addCron`.
   */
  async startAllCrons(): Promise<void> {
    const allCrons = await this.soundCronRepo.listAllCrons();
    await Promise.all(
      Object.entries(allCrons).flatMap(([serverId, crons]) =>
        crons.map(async (cron) => {
          await this.enqueueCron(serverId, cron);
        }),
      ),
    );
    /* We do this explicitly to avoid a Promise<void[]>, which
    linters dont like */
    await Promise.resolve();
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
    const baseErrorMessage = `Unable to remove soundcron ${name} for server ${serverId}`;

    /* 1. Get full soundcron from the database (necessary to remove from queue)
    See https://api.docs.bullmq.io/classes/v5.Queue.html#removeRepeatable for more
    information on why we need the full soundcron */
    let soundCron: SoundCron | undefined;
    try {
      soundCron = await this.soundCronRepo.getCron(serverId, name);
    } catch (err) {
      if (err instanceof Error) {
        throw new SoundCronServiceError(
          `${baseErrorMessage}: Unable to get soundcron from database`,
          err,
        );
      }
    }
    // I currently have no idea if this can happen
    if (soundCron === undefined) {
      throw new SoundCronServiceError(
        `${baseErrorMessage}: Soundcron not found in database`,
      );
    }

    // 2. Remove the cron from the database
    try {
      await this.soundCronRepo.removeCron(serverId, name);
    } catch (err) {
      if (err instanceof Error) {
        throw new SoundCronServiceError(
          `${baseErrorMessage}: Unable to remove from database`,
          err,
        );
      }
    }

    // 3. Add deletion key to Redis
    const key = `${serverId}:${soundCron.name}`;
    await this.redis.sadd("removedSoundCrons", key);
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    return await this.soundCronRepo.listCrons(serverId);
  }

  async listAllCrons(): Promise<Record<string, SoundCron[]>> {
    return await this.soundCronRepo.listAllCrons();
  }
}
