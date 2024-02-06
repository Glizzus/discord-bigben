import { SoundCronConfig } from '../ScheduleConfig';

export interface ISoundCronRepository {
  addSoundCrons(serverId: string, soundCrons: SoundCronConfig[]): Promise<void>;
  deleteSoundCronByName(serverId: string, name: string): Promise<number>;

  getAllSoundCrons(): AsyncIterable<[string, SoundCronConfig]>;
  getAllServerSoundCrons(serverId: string): AsyncIterable<SoundCronConfig>;
}
