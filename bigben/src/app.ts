import express from 'express';
import winston from 'winston';
import { logAll, logErrors } from './Middleware';

export function createApp(logger: winston.Logger, router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(logAll(logger));

  app.use('/api/v1', router);
  app.use(logErrors(logger));
  return app;
}
