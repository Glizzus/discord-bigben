export interface SoundCronOptions {
  name: string;
  cron: string;
  audio: string;

  timezone?: string;
  excludeChannels?: string[];
  mute?: boolean;
  description?: string;
}

export class SoundCron {
  name: string;
  cron: string;
  audio: string;

  /**
   * The timezone that the cron expression follows.
   * @see 
   * @default "Etc/UTC"
   */
  timezone = "Etc/UTC"
  excludeChannels: string[] = [];
  mute = false;

  description?: string;

  constructor(options: SoundCronOptions) {
    this.name = options.name;
    this.cron = options.cron;
    this.audio = options.audio;
    if (options.excludeChannels) {
      this.excludeChannels = options.excludeChannels;
    }
    if (options.mute) {
      this.mute = options.mute;
    }

    this.description = options.description;
  }
}