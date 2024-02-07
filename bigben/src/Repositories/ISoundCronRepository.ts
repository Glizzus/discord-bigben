import { SoundCronConfig } from '../ScheduleConfig';

export enum AddFailureReason {
  Unknown,
  AlreadyExists
}

export class AddSoundCronError extends Error {
  public readonly reason: AddFailureReason;
  constructor(message: string, reason: AddFailureReason) {
    super(message);
    this.name = "AddSoundCronError";
    this.reason = reason;
  }
}

export interface ISoundCronRepository {
  addSoundCrons(serverId: string, soundCrons: SoundCronConfig[]): Promise<void>;
  deleteSoundCronByName(serverId: string, name: string): Promise<number>;

  getAllSoundCrons(): AsyncIterable<[string, SoundCronConfig]>;
  getAllServerSoundCrons(serverId: string): AsyncIterable<SoundCronConfig>;
}
