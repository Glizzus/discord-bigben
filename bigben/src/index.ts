import discord from "discord.js";
import mariadb from "mariadb";
import { application } from "express";
import { Logger } from "./Logger";
import { AppConfig } from "./AppConfig";
import { createApp } from "./app";
import { discordClient } from "./discordClient";
import { SoundCronService } from "./Services/SoundCronService";
import { SoundCronController } from "./Controllers/SoundCronController";
import { createMasterRouter } from "./Routers/MasterRouter";
import { ScheduleCommand } from "./Commands/ScheduleCommand";
import { MariaDbSoundCronRepository } from "./Repositories/MariaDbSoundCronRepository";
import { createSoundCronRouter } from "./Routers/SoundCronRouter";

const pool = mariadb.createPool(AppConfig.mariaDbUri);

async function main() {
  let server: ReturnType<typeof application.listen> | null = null;

  async function shutdown(signal: string) {
    Logger.info(`Received ${signal}. Shutting down`);
    try {
        server?.close(() => {
          Logger.info("Server closed");
        });
      await Promise.all([
        discordClient.destroy(),
        pool.end(),
      ]);
      Logger.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      Logger.error("Error during shutdown:", err);
      process.exit(1);
    }
  }

  try {
    const soundCronRepo = new MariaDbSoundCronRepository(pool);

    const service = new SoundCronService(soundCronRepo, discordClient, Logger);
    await service.login(AppConfig.token);
    await service.startJobsFromDatabase();

    const soundCronController = new SoundCronController(service);
    const cronRouter = createSoundCronRouter(soundCronController);

    const masterRouter = createMasterRouter(cronRouter);

    const app = createApp(Logger, masterRouter);
    server = app.listen(AppConfig.port, () => {
      Logger.info(`Listening on port ${AppConfig.port}`);
    });

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    const scheduleCommand = new ScheduleCommand(service);
    const commands = [scheduleCommand.data]
    const rest = new discord.REST().setToken(AppConfig.token);

    const dict: Record<string, ScheduleCommand> = {
      schedule: scheduleCommand,
    };

    discordClient.on(discord.Events.InteractionCreate, async (interaction) => {
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
  } catch (err) {
    Logger.error("Error during startup:", err);
    await shutdown("startup error");
  }
}

main()
  .catch((err) => {
    Logger.error("Error during startup:", err);
    process.exit(1);
  })
  .finally(() => {
    Logger.info("Application exiting. Goodbye!")
  });
