import * as discord from "discord.js";
import debugLogger from "./debugLogger";
import winston from "winston";
import ScheduleConfig from "./ScheduleConfig";
import Worker from "./Worker";

export default class Orchestrator {
  private readonly client: discord.Client;
  private readonly logger: winston.Logger;
  private readonly scheduleConfig: ScheduleConfig;

  constructor(
    client: discord.Client,
    logger: winston.Logger,
    scheduleConfig: ScheduleConfig,
  ) {
    this.client = client;
    this.logger = logger;
    this.scheduleConfig = scheduleConfig;
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

    for (const server of this.scheduleConfig.servers) {
      const guild = await this.client.guilds.fetch(server.id);
      await Promise.all(
        server.intervals.map(async (interval) => {
          const worker = new Worker(guild, interval);
          await worker.run();
        }),
      );
    }
  }
}
