import { SoundCron } from "./SoundCron";

export interface JobQueue {
  add: (serverId: string, soundCron: SoundCron) => Promise<void>;
  remove: (serverId: string, soundCron: SoundCron) => Promise<boolean>;
}
