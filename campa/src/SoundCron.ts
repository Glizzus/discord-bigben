export interface SoundCron {
  name: string;
  cron: string;
  audio: string;

  timezone?: string;
  excludeChannels?: string[];
  mute?: boolean;
  description?: string;
}
