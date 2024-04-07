import { type UUID } from "crypto";
import { type Redis } from "ioredis";

export interface WorkerRecordRepo {
  addWorkerRecord: (workerId: UUID, jobId: string) => Promise<void>;
  addUnassigned: (jobId: string) => Promise<void>;

  retrieveWorkerRecords: (workerId: UUID) => Promise<string[]>;
  retrieveUnassigned: () => Promise<string[]>;
}

export class RedisWorkerRecordRepo implements WorkerRecordRepo {
  constructor(private readonly redis: Redis) {}

  private keyify(workerId: UUID): string {
    return `worker:${workerId}`;
  }

  async addWorkerRecord(workerId: UUID, jobId: string): Promise<void> {
    await this.redis
      .multi()
      .srem("unassigned", jobId)
      .sadd(this.keyify(workerId), jobId)
      .exec();
  }

  async addUnassigned(jobId: string): Promise<void> {
    await this.redis.sadd("unassigned", jobId);
  }

  async retrieveWorkerRecords(workerId: UUID): Promise<string[]> {
    return await this.redis.smembers(this.keyify(workerId));
  }

  async retrieveUnassigned(): Promise<string[]> {
    return await this.redis.smembers("unassigned");
  }
}
