import { Router } from 'express';
import ConfigController from '../Controllers/ConfigController';

export default function createConfigRouter(controller: ConfigController): Router {
  const router = Router();

  router.get('/:serverId', controller.getConfigForServer);
  router.put('/:serverId', controller.updateConfigForServer);

  return router;
}
