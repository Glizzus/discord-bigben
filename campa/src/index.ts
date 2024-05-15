import { MariaDbSoundCronRepo } from "./SoundCronRepo";
import { SoundCronService } from "./SoundCronService";
import { logger } from "./logging";
import { ScheduleCommand } from "./ScheduleCommand";
import { type Command } from "./Command";
import * as discordService from "./DiscordService";
import { HelpCommand } from "./HelpCommand";
import { HttpWarehouseClient } from "./HttpWarehouseClient";
import { BullMqJobQueue } from "./BullMqJobQueue";

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getEnvOrDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

async function main(): Promise<void> {

  const mariadbUri = getEnvOrThrow("CAMPA_MARIADB_URI");
  const soundCronRepo = new MariaDbSoundCronRepo(mariadbUri);

  const redisPort = getEnvOrDefault("CAMPA_REDIS_PORT", "6379");
  const redisHost = getEnvOrThrow("CAMPA_REDIS_HOST");
  const jobQueue = new BullMqJobQueue(redisHost, parseInt(redisPort));

  const warehouseEndpoint = getEnvOrThrow("CAMPA_WAREHOUSE_ENDPOINT");
  const warehouseClient = new HttpWarehouseClient(warehouseEndpoint);

  const soundCronService = new SoundCronService(
    soundCronRepo,
    warehouseClient,
    jobQueue,
    logger,
  );

  const commands: Record<string, Command> = {
    "schedule": new ScheduleCommand(soundCronService),
    "help": new HelpCommand()
  };

  const discordToken = getEnvOrThrow("CAMPA_DISCORD_TOKEN");
  const discordClientId = getEnvOrThrow("CAMPA_CLIENT_ID");
  await discordService.start(discordToken, discordClientId, commands, logger);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
