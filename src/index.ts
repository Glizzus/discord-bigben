import discord from "discord.js";

import Orchestrator from "./Orchestrator";
import Logger from "./Logger";
import { retrieveScheduleConfig } from "./ScheduleConfig";
import AppConfig from "./AppConfig";

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

async function main() {
  const client = new discord.Client(options);

  const scheduleConfig = retrieveScheduleConfig("bigben.json");
  if (!scheduleConfig) {
    Logger.error("Unable to retrieve schedule config");
    process.exit(1);
  }

  const orchestrator = new Orchestrator(client, Logger, scheduleConfig);
  await orchestrator.login(AppConfig.token);
  await orchestrator.run();
}

main();
