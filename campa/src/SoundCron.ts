export interface SoundCronOptions {
  name: string;
  cron: string;
  audio: string;
  timezone: string;

  excludeChannels?: string[];
  mute?: boolean;
  description?: string;
}

export class SoundCron {
  name: string;
  cron: string;
  audio: string;
  timezone: string;
  excludeChannels: string[];
  mute: boolean;

  description?: string;

  constructor(options: SoundCronOptions) {
    this.name = options.name;
    this.cron = options.cron;
    this.audio = options.audio;
    this.timezone = options.timezone;

    this.mute = options.mute ?? false;
    this.excludeChannels = options.excludeChannels ?? [];

    this.description = options.description;
  }
}