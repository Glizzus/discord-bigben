import { UUID } from 'crypto';

/**
 * SoundCronWorkerMediator is a mediator that manages the assignment of sound cron jobs to workers.
 * A SoundCronWorkerMediator doesn't take any action; it merely uses a middleman (like Redis) to
 * declare which workers are assigned to which sound cron jobs.
 */
export interface SoundCronWorkerMediator {
  assignWorker: (workerId: UUID, soundCronKey: string) => Promise<void>;
  getWorkerAssignments: (workerId: UUID) => Promise<string[]>;

  addUnassignedSoundCron: (soundCronKey: string) => Promise<void>;
  getUnassignedSoundCrons: () => Promise<string[]>;

  checkWorkerAlive: (workerId: UUID) => Promise<boolean>;
  markWorkerDead: (workerId: UUID) => Promise<void>;

  markSoundCronRemoved: (soundCronKey: string) => Promise<void>;

  heartbeat: () => Promise<void>;
}
