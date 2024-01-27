import discord from "discord.js";
import { MongoClient } from "mongodb";
import Orchestrator from "./Orchestrator";
import Logger from "./Logger";
import AppConfig from "./AppConfig";
import MongoConfigStorage, {
  MongoServerConfig,
} from "./ConfigStorage/MongoConfigRepository";
import express from "express";
import { logAll, logErrors } from "./Middleware";

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

  app.use(logErrors(Logger));
  app.listen(AppConfig.port, () => {
    Logger.info(`Listening on port ${AppConfig.port}`);
  });

  const orchestrator = new Orchestrator(client, Logger, configStorage);
  await orchestrator.login(AppConfig.token);
  await orchestrator.run();
}

main();
