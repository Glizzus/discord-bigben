import discord from "discord.js";
import { MongoClient } from "mongodb";
import Orchestrator from "./Orchestrator";
import Logger from "./Logger";
import { ServerConfig, retrieveScheduleConfig } from "./ScheduleConfig";
import AppConfig from "./AppConfig";
import MongoConfigStorage from "./ConfigStorage/MongoConfigRepository";
import express from "express";

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

const app = express();
app.use(express.json());

async function main() {
  const client = new discord.Client(options);

  const mongoClient = new MongoClient(AppConfig.mongoUri);
  await mongoClient.connect();
  const db = mongoClient.db();
  const collection = db.collection<ServerConfig>("serverConfig");
  const configStorage = await MongoConfigStorage.create(collection);

  app.get("/api/v1/config/:serverId", async (req, res) => {
    const serverId = req.params.serverId;
    const config = await configStorage.getConfigForServer(serverId);
    if (config === null) {
      res.sendStatus(404);
    } else {
      res.json(config);
    }
  });

  app.put("/api/v1/config/:serverId", async (req, res) => {
    const serverId = req.params.serverId;
    const config = req.body as ServerConfig;
    await configStorage.updateConfigForServer(serverId, config);
    res.sendStatus(200);
  });

  app.delete("/api/v1/config/:serverId", async (req, res) => {
    const serverId = req.params.serverId;
    await configStorage.deleteConfigForServer(serverId);
    res.sendStatus(200);
  });

  app.listen(3000, () => {
    Logger.info("Listening on port 3000");
  });

  const orchestrator = new Orchestrator(client, Logger, configStorage);
  await orchestrator.login(AppConfig.token);
  await orchestrator.run();
}

main();

