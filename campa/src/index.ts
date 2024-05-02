import * as discord from "discord.js";
import * as mariadb from "mariadb";
import { MariaDbSoundCronRepo } from "./SoundCronRepo";
import { SoundCronService } from "./SoundCronService";
import { debugLogger, logger } from "./logging";
import { ScheduleCommand } from "./ScheduleCommand";
import { type Command } from "./Command";
import { Redis } from "ioredis";

export interface SoundCron {
  name: string;
  cron: string;
  audio: string;

  timezone?: string;
  excludeChannels?: string[];
  mute?: boolean;
  description?: string;
}

const mariadbUri =
  process.env.MARIADB_URI ??
  (() => {
    throw new Error("MARIADB_URI is required");
  })();

const clientId =
  process.env.CLIENT_ID ??
  (() => {
    throw new Error("CLIENT_ID is required");
  })();

const redisHost =
  process.env.REDIS_HOST ??
  (() => {
    throw new Error("REDIS_HOST is required");
  })();

const redisPort =
  process.env.REDIS_PORT ??
  (() => {
    const defaultPort = "6379";
    debugLogger(`REDIS_PORT is not set, defaulting to ${defaultPort}`);
    return defaultPort;
  })();

const warehouseEndpointVar = "CAMPA_WAREHOUSE_ENDPOINT";
const warehouseEndpoint =
  process.env[warehouseEndpointVar] ??
  (() => {
    throw new Error(`${warehouseEndpointVar} is required`);
  })();

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

async function main(): Promise<void> {
  const redis = new Redis(parseInt(redisPort), redisHost, {
    // We need to make this null for some reason or it errors
    maxRetriesPerRequest: null,
  });
  const pool = mariadb.createPool(mariadbUri);
  const soundCronRepo = new MariaDbSoundCronRepo(pool);

  const soundCronService = new SoundCronService(
    soundCronRepo,
    warehouseEndpoint,
    redis,
    logger,
  );

  const discordClient = new discord.Client(options);
  const discordToken =
    process.env.DISCORD_TOKEN ??
    (() => {
      throw new Error("DISCORD_TOKEN is required");
    })();
  await discordClient.login(discordToken);

  const scheduleCommand = new ScheduleCommand(soundCronService);

  const commandMap: Record<string, Command> = {
    schedule: scheduleCommand,
  };

  try {
    const rest = new discord.REST().setToken(discordToken);
    await rest.put(discord.Routes.applicationCommands(clientId), {
      body: Object.values(commandMap).map((c) => c.data),
    });
  } catch (err) {
    logger.error(`Failed to register commands: ${err}`);
  }

  discordClient.on(discord.Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      try {
        const command = commandMap[interaction.commandName];
        if (command !== undefined) {
          await command.execute(interaction);
        } else {
          await interaction.reply("Unknown command");
        }
      } catch (err) {
        logger.error(err);
        await interaction.reply("An unknown error occurred");
      }
    } else if (interaction.isAutocomplete()) {
      const command = commandMap[interaction.commandName];
      if (command !== undefined) {
        await command.autocomplete(interaction);
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
