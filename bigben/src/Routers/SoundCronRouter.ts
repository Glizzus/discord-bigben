import { Router } from 'express';
import { SoundCronController } from '../Controllers/SoundCronController';

export function createSoundCronRouter(controller: SoundCronController): Router {
  const router = Router({ mergeParams: true });

  router.get('/', controller.getSoundCronsForServer);
  router.put('/', controller.addSoundCronsForServer);
  router.delete('/:soundCronName', controller.deleteSoundCronForServer);

  return router;
}
