import { UUID } from "crypto";

export interface SoundCronJob {
  serverId: string;
  name: string;
  cron: string;
  timezone: string;
  audio: string;
  mute: boolean;
  excludeChannels: string[];
}

export interface SoundCronHeartbeat {
  workerId: UUID;
  key: string;
  lastRan: Date;
  timesActivated: number;
}
