export interface WorkerMediator {
  checkSoundCronRemoved: (soundCronKey: string) => Promise<boolean>;
  removeSoundCron: (soundCronKey: string) => Promise<void>;

  checkWorkerDead: () => Promise<boolean>;

  heartbeat: () => Promise<void>;
}
