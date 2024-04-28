export interface SoundCronJob {
  serverId: string;
  name: string;
  audio: string;
  mute: boolean;
  excludeChannels: string[];
}
