import { Router } from 'express';

export function createMasterRouter(soundCronRouter: Router) {
  const router = Router();

  router.use("/:serverId/soundCron", soundCronRouter);

  return router;
}
