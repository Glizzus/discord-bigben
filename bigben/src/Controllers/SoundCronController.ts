import { Request, Response, NextFunction } from "express";
import { SoundCronConfig, assertSoundCronConfigs } from "../ScheduleConfig";
import { SoundCronService } from "../Services/SoundCronService";

export class SoundCronController {

  private readonly service: SoundCronService;

  constructor(service: SoundCronService) {
    if (service === undefined || service === null) {
      throw new Error("ConfigController: service must not be null");
    }
    this.service = service;
    this.addSoundCronsForServer = this.addSoundCronsForServer.bind(this);
    this.getSoundCronsForServer = this.getSoundCronsForServer.bind(this);
    this.deleteSoundCronForServer = this.deleteSoundCronForServer.bind(this);
  }

  public async getSoundCronsForServer(
    req: Request<{ serverId: string }>,
    res: Response<SoundCronConfig[]>,
    next: NextFunction,
  ) {
    try {
      const serverId = req.params.serverId;
      const crons = [];
      const config = this.service.getSoundCronsForServer(serverId);
      for await (const cron of config) {
        crons.push(cron);
      }
      res.json(crons);
    } catch (err) {
      next(err);
    }
  }

  public async addSoundCronsForServer(
    req: Request<{ serverId: string }, any, unknown>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const serverId = req.params.serverId;
      const config = req.body;
      try {
        assertSoundCronConfigs(config);
      } catch (err) {
        if (err instanceof Error) {
          return res.status(400).json({ message: err.message });
        }
        /* If we somehow get a non-Error object, throw it.
                Some middleware will catch it and log it. */
        throw err;
      }
      await this.service.addSoundCrons(serverId, config);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  }

  public async deleteSoundCronForServer(
    req: Request<{ serverId: string, soundCronName: string }>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { serverId, soundCronName } = req.params;
      await this.service.deleteSoundCronByName(serverId, soundCronName);
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  }
}
