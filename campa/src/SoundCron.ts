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

  timezone: string;
  defaultTimezone = "Etc/UTC"

  excludeChannels: string[];
  mute: boolean;
  description?: string;

  constructor(options: SoundCronOptions) {
    this.name = options.name;
    this.cron = options.cron;
    this.audio = options.audio;
    this.timezone = options.timezone ?? this.defaultTimezone;
    this.excludeChannels = options.excludeChannels ?? [];
    this.mute = options.mute ?? false;
    this.description = options.description;
  }
}