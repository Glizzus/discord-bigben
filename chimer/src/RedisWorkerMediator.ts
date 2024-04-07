import Redis from "ioredis";
import { WorkerMediator } from "./WorkerMediator";

export class RedisWorkerMediator implements WorkerMediator {
  constructor(
    public readonly workerId: string,
    private readonly redis: Redis
  ) {}

  async checkSoundCronRemoved(soundCronKey: string): Promise<boolean> {
    return await this.redis.sismember("removedSoundCrons", soundCronKey) === 1;
  }

  async removeSoundCron(soundCronKey: string): Promise<void> {
    await this.redis.sadd("removedSoundCrons", soundCronKey);
  }

  async checkWorkerDead(): Promise<boolean> {
    return await this.redis.sismember("deadWorkers", this.workerId) === 1;
  }

  async heartbeat(): Promise<void> {
    const { workerId } = this;
    await this.redis.setex(`heartbeat:${workerId}`, 10, JSON.stringify({ workerId }));
  }
}
