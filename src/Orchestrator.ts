import * as discord from "discord.js";
import debugLogger from "./debugLogger";
import winston from "winston";
import Worker from "./Worker";
import IConfigStorage, { ConfigStorageEvent } from "./IConfigStorage";

export default class Orchestrator {
  private readonly client: discord.Client;
  private readonly logger: winston.Logger;
  private readonly configStorage: IConfigStorage;

  constructor(
    client: discord.Client,
    logger: winston.Logger,
    configStorage: IConfigStorage
  ) {
    this.client = client;
    this.logger = logger;
    this.configStorage = configStorage;
  }

  public async login(token: string) {
    this.client.login(token);
    debugLogger("Attempting to log in");

    const successPromise = new Promise<void>((res) => {
      this.client.once(discord.Events.ClientReady, (c) => {
        this.logger.info(`Logged in as ${c.user.tag}`);
        res();
      });
    });

    const errorListener = (_: unknown, rej: (error: Error) => void) => {
      this.client.once(discord.Events.Error, rej);
    };
    const errorPromise = new Promise<void>(errorListener);

    await Promise.race([successPromise, errorPromise]);

    // By this point, we have logged in. We can undo the error listener.
    this.client.removeListener(discord.Events.Error, errorListener);
  }

  async run() {
    if (!this.client.isReady()) {
      const message = "Client is not ready. Please call login() first";
      throw new Error(message);
    }
    debugLogger("Running Orchestrator");

    // Map of server ID to workers.
    // This should not be too stafeful; any real state should be in
    // services like MongoDB or Redis.
    const map = new Map<string, Worker[]>();

    // When we get an update, stop the workers and start them again.
    // OPTIMIZATION: Only stop and start workers for intervals that have changed.
    this.configStorage.on(ConfigStorageEvent.ConfigUpdated, async (serverId, config) => {
      debugLogger(`Config updated for server ${serverId}`);
      map.get(serverId)?.forEach((worker) => {
        debugLogger(`Stopping worker for server ${serverId} due to config update`);
        worker.stop();
      });

      const guild = await this.client.guilds.fetch(serverId);
      const workers = config.intervals.map((interval) => new Worker(guild, interval));
      map.set(serverId, workers);
      workers.forEach((worker) => {
        debugLogger(`Starting worker for server ${serverId} due to config update`);
        worker.run();
      });
    });

    // When we get a delete, stop the workers and remove them from the map.
    this.configStorage.on(ConfigStorageEvent.ConfigRemoved, (serverId) => {
      debugLogger(`Config removed for server ${serverId}`);
      map.get(serverId)?.forEach((worker) => {
        debugLogger(`Stopping worker for server ${serverId} due to config removal`);
        worker.stop();
      });
      map.delete(serverId);
    });

    // Start the workers that were already in the database when we started.
    for await (const server of this.configStorage.getAllConfig()) {
      debugLogger(`Starting workers for server ${server.id} due to initial config`);
      const guild = await this.client.guilds.fetch(server.id);
      for (const interval of server.intervals) {
        const worker = new Worker(guild, interval);
        if (!map.has(server.id)) {
          map.set(server.id, [worker]);
        } else {
          map.get(server.id)?.push(worker);
        }
        worker.run();
      }
    }
  }
}
