import discord from "discord.js";
import { MongoClient } from "mongodb";
import Logger from "./Logger";
import AppConfig from "./AppConfig";
import MongoConfigStorage, {
  MongoServerConfig,
} from "./ConfigStorage/MongoConfigRepository";
import express from "express";
import { logAll, logErrors } from "./Middleware";
import ConfigService from "./Services/ConfigService";
import ConfigController from "./Controllers/ConfigController";
import createConfigRouter from "./Routers/ConfigRouter";

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

const app = express();
app.use(express.json());
app.use(logAll(Logger));

const client = new discord.Client(options);
const mongoClient = new MongoClient(AppConfig.mongoUri);

async function main() {
  await mongoClient.connect();
  const db = mongoClient.db();
  const collection = db.collection<MongoServerConfig>("serverConfig");
  const configStorage = await MongoConfigStorage.create(collection);

  const service = new ConfigService(configStorage, client, Logger);
  await service.login(AppConfig.token);
  await service.startJobsFromDatabase();

  const configController = new ConfigController(service);
  const configRouter = createConfigRouter(configController);

  const masterRouter = express.Router();
  masterRouter.use("/config", configRouter);

  app.use("/api/v1", masterRouter);

  app.use(logErrors(Logger));
  app.listen(AppConfig.port, () => {
    Logger.info(`Listening on port ${AppConfig.port}`);
  });

}

main();
