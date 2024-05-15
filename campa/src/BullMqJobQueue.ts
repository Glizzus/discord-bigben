import { SoundCronJob } from "@discord-bigben/types";
import { JobQueue } from "./JobQueue";
import * as bullmq from "bullmq";
import { SoundCron } from "./SoundCron";

type SoundCronQueue = bullmq.Queue<SoundCronJob>;

export class BullMqJobQueue implements JobQueue {
  private readonly queue: SoundCronQueue;

  constructor(host: string, port: number) {
    this.queue = new bullmq.Queue("soundCron", {
      connection: {
        host,
        port
      }
    });
  }

  async add(serverId: string, soundCron: SoundCron): Promise<void> {
    const { name, timezone, cron } = soundCron;
    if (serverId === undefined) {
      throw new Error("Server ID is undefined - refusing to enqueue soundcron");
    } else if (soundCron.name === undefined) {
      throw new Error("Soundcron name is undefined (not literally) - refusing to enqueue soundcron");
    }
    const jobName = `${serverId}:${soundCron.name}`;
    const jobData: SoundCronJob = {
      serverId,
      name,
      audio: soundCron.audio,
      mute: soundCron.mute,
      excludeChannels: soundCron.excludeChannels
    };
    await this.queue.add(jobName, jobData, {
      repeat: {
        pattern: cron,
        tz: timezone
      }
    });
  }

  async remove(serverId: string, soundCron: SoundCron): Promise<boolean> {
    const jobName = `${serverId}:${soundCron.name}`;
    return this.queue.removeRepeatable(jobName, {
      pattern: soundCron.cron,
      tz: soundCron.timezone
    });
  }
}