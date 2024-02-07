import winston from "winston";
import * as discord from "discord.js";
import { debugLogger } from "../debugLogger";
import { Worker } from "../Worker";
import { SoundCronConfig } from "../ScheduleConfig";
import { ISoundCronRepository } from "../Repositories/ISoundCronRepository";

export class SoundCronService {
  private readonly repo: ISoundCronRepository;
  private readonly discordClient: discord.Client;
  private readonly logger: winston.Logger;

  private readonly workerMap = new Map<string, Map<string, Worker>>();

  public activeSoundCronNames(serverId: string) {
    const serverMap = this.workerMap.get(serverId);
    if (serverMap === undefined) {
      return []
    }
    return [...serverMap.keys()]
  }

  constructor(
    repo: ISoundCronRepository,
    discordClient: discord.Client,
    logger: winston.Logger,
  ) {
    this.repo = repo;
    this.discordClient = discordClient;
    this.logger = logger;
  }

  public async login(token: string) {
    this.discordClient.login(token);
    debugLogger("Attempting to log in");

    const successPromise = new Promise<void>((res) => {
      this.discordClient.once(discord.Events.ClientReady, (c) => {
        this.logger.info(`Logged in as ${c.user.tag}`);
        res();
      });
    });

    const errorListener = (_: unknown, rej: (error: Error) => void) => {
      this.discordClient.once(discord.Events.Error, rej);
    };
    const errorPromise = new Promise<void>(errorListener);

    await Promise.race([successPromise, errorPromise]);

    // By this point, we have logged in. We can undo the error listener.
    this.discordClient.removeListener(discord.Events.Error, errorListener);
  }

  private registerConfig(serverId: string, config: SoundCronConfig) {
    const guild = this.discordClient.guilds.cache.get(String(serverId));
    if (guild === undefined) {
      this.logger.warn(`Unable to find guild ${serverId}`);
      return false;
    }
    const worker = new Worker(guild, config);
    worker.run();
    const cronMap = this.workerMap.get(serverId);
    if (cronMap === undefined) {
      this.workerMap.set(serverId, new Map([[config.name, worker]]));
    } else {
      cronMap.set(config.name, worker);
    }
  }

  async startJobsFromDatabase() {
    if (!this.discordClient.isReady()) {
      const message = "Client is not ready. Please call login() first";
      throw new Error(message);
    }
    debugLogger("Running Orchestrator");
    let count = 0;
    for await (const cron of this.repo.getAllSoundCrons()) {
      count += 1;
      const [serverId, config] = cron;
      const _ = this.registerConfig(serverId, config);
    }
    debugLogger(`Started ${count} soundCrons from the database`);
  }

  async addSoundCrons(serverId: string, crons: SoundCronConfig[]) {
    await this.repo.addSoundCrons(serverId, crons);
    for (const cron of crons) {
      this.registerConfig(serverId, cron);
    }
    debugLogger(`Added soundCron for server ${serverId}`);
  }

  async deleteSoundCronByName(serverId: string, name: string) {
    const result = await this.repo.deleteSoundCronByName(serverId, name);
    const cronMap = this.workerMap.get(serverId);
    if (cronMap === undefined) {
      return;
    }
    const worker = cronMap.get(name);
    worker?.stop();
    debugLogger(`Deleted ${result} soundCron(s) for server ${serverId}`);
  }

  getSoundCronsForServer(serverId: string) {
    return this.repo.getAllServerSoundCrons(serverId);
  }
}
