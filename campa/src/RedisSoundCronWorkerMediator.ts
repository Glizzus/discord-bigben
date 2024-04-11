import Redis from "ioredis";
import { SoundCronWorkerMediator } from "./SoundCronWorkerMediator";
import { UUID } from "crypto";

export class RedisSoundCronWorkerMediator implements SoundCronWorkerMediator {

  public constructor(
    private readonly redis: Redis,
  ) {}

  async assignWorker(workerId: UUID, soundCronKey: string): Promise<void> {
    await this.redis
      .multi()
      .srem("unassigned", soundCronKey)
      .sadd(`worker:${workerId}`, soundCronKey)
      .exec();
  }

  async getWorkerAssignments(workerId: UUID): Promise<string[]> {
    return await this.redis.smembers(`worker:${workerId}`);
  }

  async addUnassignedSoundCron(soundCronKey: string): Promise<void> {
    await this.redis.sadd('unassigned', soundCronKey);
  }

  async getUnassignedSoundCrons(): Promise<string[]> {
    return await this.redis.smembers('unassigned');
  }

  async checkWorkerAlive(workerId: UUID): Promise<boolean> {
    return await this.redis.exists(`heartbeat:${workerId}`) === 1;
  }

  async markWorkerDead(workerId: UUID): Promise<void> {
    await this.redis.sadd("deadWorkers", workerId);
  }

  async markSoundCronRemoved(soundCronKey: string): Promise<void> {
    await this.redis.sadd("removedSoundCrons", soundCronKey);
  }

  async heartbeat(): Promise<void> {
    await this.redis.setex(`heartbeat:master`, 10, 1);
  }
}
