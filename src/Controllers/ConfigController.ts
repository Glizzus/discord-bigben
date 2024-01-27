import IConfigStorage from "../IConfigStorage";
import { Request, Response, NextFunction } from "express";
import { ServerConfig, assertServerConfig } from "../ScheduleConfig";

class ConfigController {
  private readonly configStorage: IConfigStorage;

  constructor(configStorage: IConfigStorage) {
    this.configStorage = configStorage;
  }

  public async getConfigForServer(
    req: Request<{ serverId: string }>,
    res: Response<ServerConfig>,
    next: NextFunction,
  ) {
    try {
      const serverId = req.params.serverId;
      const config = await this.configStorage.getConfigForServer(serverId);
      if (config === null) {
        res.sendStatus(404);
      } else {
        res.json(config);
      }
    } catch (err) {
      next(err);
    }
  }

  public async updateConfigForServer(
    req: Request<{ serverId: string }, any, unknown>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const serverId = req.params.serverId;
      const config = req.body;
      try {
        assertServerConfig(config);
      } catch (err) {
        if (err instanceof Error) {
          return res.status(400).json({ message: err.message });
        }
        /* If we somehow get a non-Error object, throw it.
                Some middleware will catch it and log it. */
        throw err;
      }
      await this.configStorage.updateConfigForServer(serverId, config);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  }
}
