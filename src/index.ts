import discord from "discord.js";
import mariadb from "mariadb";
import Logger from "./Logger";
import AppConfig from "./AppConfig";
import express from "express";
import { logAll, logErrors } from "./Middleware";
import SoundCronService from "./Services/SoundCronService";
import SoundCronController from "./Controllers/SoundCronController";
import createScheduleRouter from "./Routers/SoundCronRouter";
import ScheduleCommand from "./Commands/ScheduleCommand";
import { MariaDbSoundCronRepository } from "./Repositories/MariaDbSoundCronRepository";

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

const pool = mariadb.createPool(AppConfig.mariaDbUri);

async function main() {

  const configStorage = new MariaDbSoundCronRepository(pool);

  const service = new SoundCronService(configStorage, client, Logger);
  await service.login(AppConfig.token);
  await service.startJobsFromDatabase();

  const configController = new SoundCronController(service);
  const configRouter = createScheduleRouter(configController);

  const masterRouter = express.Router();
  masterRouter.use("/config", configRouter);

  app.use("/api/v1", masterRouter);

  app.use(logErrors(Logger));
  app.listen(AppConfig.port, () => {
    Logger.info(`Listening on port ${AppConfig.port}`);
  });

  const scheduleCommand = new ScheduleCommand(service);
  const commands = [scheduleCommand.data]
  const rest = new discord.REST().setToken(AppConfig.token);

  const dict: Record<string, ScheduleCommand> = {
    schedule: scheduleCommand,
  };

  client.on(discord.Events.InteractionCreate, async (interaction) => {
    Logger.info(`Received interaction ${interaction.id} with type ${interaction.type}`);
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const command = dict[interaction.commandName];
    if (command === undefined) {
      Logger.warn(`Received interaction for unknown command ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      Logger.error(`Error while executing command ${interaction.commandName}`);
      Logger.error(err);
    }
  });
  Logger.info(`Started refreshing ${commands.length} application (/) commands.`);
  await rest.put(
    discord.Routes.applicationCommands(AppConfig.clientId),
    {
      body: [scheduleCommand.data],
    }
  );
  Logger.info("Successfully reloaded application (/) commands.");
}

main();
