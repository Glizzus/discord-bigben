import { Router } from 'express';
import SoundCronController from '../Controllers/SoundCronController';

export default function createScheduleRouter(controller: SoundCronController): Router {
  const router = Router();

  router.get('/:serverId/soundCron', controller.getSoundCronsForServer);
  router.put('/:serverId/soundCron', controller.addSoundCronsForServer);
  router.delete('/:serverId/soundCron/:soundCronName', controller.deleteSoundCronForServer);

  return router;
}
