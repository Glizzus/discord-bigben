import * as discord from "discord.js";
import * as mariadb from "mariadb";
import * as bullmq from "bullmq";
import { MariaDbSoundCronRepo } from "./SoundCronRepo";
import { type SoundCronJob, SoundCronService } from "./SoundCronService";
import { type Command, ScheduleCommand } from "./ScheduleCommand";

export interface SoundCron {
  name: string;
  cron: string;
  audio: string;

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

const pool = mariadb.createPool(mariadbUri);
const soundCronRepo = new MariaDbSoundCronRepo(pool);

const redisHost =
  process.env.REDIS_HOST ??
  (() => {
    throw new Error("REDIS_HOST is required");
  })();

const redisPort =
  process.env.REDIS_PORT ??
  (() => {
    const defaultPort = "6379";
    console.warn(`REDIS_PORT is not set, defaulting to ${defaultPort}`);
    return defaultPort;
  })();

const soundCronQueue = new bullmq.Queue<SoundCronJob>("soundCron", {
  connection: {
    host: redisHost,
    port: parseInt(redisPort),
  },
});

const soundCronService = new SoundCronService(soundCronRepo, soundCronQueue);

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

async function main(): Promise<void> {
  /* Kick off all of the soundcrons in the database.
  We don't need to await this immediately */
  const allCronsStarted = soundCronService.startAllCrons();
  const cronsStartedTime = Date.now();

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

  const rest = new discord.REST().setToken(discordToken);
  await rest.put(
    discord.Routes.applicationCommands(clientId),
    { body: Object.values(commandMap).map((c) => c.data) },
  );

  discordClient.on(discord.Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = commandMap[interaction.commandName];
      if (command !== undefined) {
        await command.execute(interaction);
      } else {
        await interaction.reply("Unknown command");
      }
    } else if (interaction.isAutocomplete()) {
      const command = commandMap[interaction.commandName];
      if (command !== undefined) {
        await command.autocomplete(interaction);
      }
    }
  });

  // This should eventually finish
  await allCronsStarted;
  const cronsStartedDuration = Date.now() - cronsStartedTime;
  console.log(`All crons started in ${cronsStartedDuration}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
