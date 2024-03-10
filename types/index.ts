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

export interface SoundCronJobEstablished {
  key: string;
  workerId: UUID;
}

export interface SoundCronHeartbeat {
  workerId: UUID;
}
