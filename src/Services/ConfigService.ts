import winston from "winston";
import IConfigStorage from "../IConfigStorage";
import * as discord from "discord.js";
import debugLogger from "../debugLogger";
import Worker from "../Worker";
import { ServerConfig } from "../ScheduleConfig";

export default class ConfigService {
  private readonly repo: IConfigStorage;
  private readonly discordClient: discord.Client;
  private readonly logger: winston.Logger;

  private readonly workerMap = new Map<string, Worker[]>();

  constructor(
    repo: IConfigStorage,
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

  private async registerConfig(serverId: string, config: ServerConfig) {
    const guild = this.discordClient.guilds.cache.get(serverId);
    if (guild === undefined) {
      this.logger.warn(`Unable to find guild ${serverId}`);
      return false;
    }
    const workers = config.schedule.map((interval) => {
      return new Worker(guild, interval);
    });
    this.workerMap.set(serverId, workers);
    workers.forEach((worker) => worker.run());
    return true;
  }

  async startJobsFromDatabase() {
    if (!this.discordClient.isReady()) {
      const message = "Client is not ready. Please call login() first";
      throw new Error(message);
    }
    debugLogger("Running Orchestrator");
    for await (const config of this.repo.getAllConfig()) {
      const _ = await this.registerConfig(config.serverId, config);
    }
  }

  async addServer(serverId: string, config: ServerConfig) {
    /* We use the result instead of the config passed in because the result
    is more likely to represent what is actually in the database. */
    const result = await this.repo.updateConfigForServer(serverId, config);
    const _ = await this.registerConfig(result.serverId, result);
  }

  async removeServer(serverId: string) {
    await this.repo.deleteConfigForServer(serverId);
    const workers = this.workerMap.get(serverId);
    if (workers !== undefined) {
      workers.forEach((worker) => worker.stop());
    }
    this.workerMap.delete(serverId);
  }

  getConfigForServer(serverId: string) {
    return this.repo.getConfigForServer(serverId);
  }
}
