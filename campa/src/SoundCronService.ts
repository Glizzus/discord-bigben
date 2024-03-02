import type * as bullmq from "bullmq";
import * as cronparser from "cron-parser";
import { type SoundCron } from ".";
import { type SoundCronRepo, SoundCronServiceError } from "./SoundCronRepo";

type SoundCronQueue = bullmq.Queue<SoundCronJob>;

export interface SoundCronJob {
  serverId: string;
  audio: string;
  mute: boolean;
}

/**
 * A service for managing soundcrons. This service is responsible for adding and removing soundcrons.
 * This handles data persistence and queue management.
 */
export class SoundCronService {
  constructor(
    private readonly soundCronRepo: SoundCronRepo,
    private readonly soundCronQueue: SoundCronQueue,
  ) {}

  private async enqueueCron(
    serverId: string,
    soundCron: SoundCron,
  ): Promise<void> {
    const key = `${serverId}:${soundCron.name}`;
    const job: SoundCronJob = {
      serverId,
      audio: soundCron.audio,
      mute: soundCron.mute ?? false,
    };
    await this.soundCronQueue.add(key, job, {
      repeat: {
        pattern: soundCron.cron,
      },
    });
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

    // 3. Remove the cron from the queue
    const key = `${serverId}:${soundCron.name}`;
    try {
      await this.soundCronQueue.removeRepeatable(key, {
        pattern: soundCron.cron,
      });
    } catch (err) {
      if (err instanceof Error) {
        throw new SoundCronServiceError(
          `${baseErrorMessage}: Unable to remove from queue`,
          err,
        );
      }
    }
  }

  async listCrons(serverId: string): Promise<SoundCron[]> {
    return await this.soundCronRepo.listCrons(serverId);
  }

  async listAllCrons(): Promise<Record<string, SoundCron[]>> {
    return await this.soundCronRepo.listAllCrons();
  }
}
