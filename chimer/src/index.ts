import * as bullmq from "bullmq";
import * as discord from "discord.js";
import * as discordVoice from "@discordjs/voice";
import * as undici from "undici";
import { debugLogger, logger } from "./logging";
import { type SoundCronJob } from "@discord-bigben/types";

const audioPlayer = discordVoice.createAudioPlayer({
  behaviors: {
    noSubscriber: discordVoice.NoSubscriberBehavior.Pause,
  },
});

function largestVoiceChannel(guild: discord.Guild) {
  const filter = (
    channel: discord.Channel,
  ): channel is discord.VoiceChannel => {
    return channel.type === discord.ChannelType.GuildVoice;
  };
  const voiceChannels = guild.channels.cache.filter(filter);
  return voiceChannels.reduce((max, channel) => {
    return channel.members.size > max.members.size ? channel : max;
  }, voiceChannels.first());
}

async function muteMembers(guild: discord.VoiceChannel) {
  await Promise.all(
    guild.members.map((member) => {
      debugLogger(`Muting ${member.user.tag}`);
      return member.voice.setMute(true, "The bell tolls");
    }),
  );
}

async function unmuteMembers(guild: discord.VoiceChannel) {
  await Promise.all(
    guild.members.map((member) => {
      debugLogger(`Unmuting ${member.user.tag}`);
      return member.voice.setMute(false, "The bell is done tolling");
    }),
  );
}

async function createDiscordClient() {

  const options: discord.ClientOptions = {
    intents: [
      discord.GatewayIntentBits.Guilds,
      discord.GatewayIntentBits.GuildMembers,
      discord.GatewayIntentBits.GuildVoiceStates,
    ],
  };

  const discordTokenVar = "CHIMER_DISCORD_TOKEN";
  const discordToken =
    process.env[discordTokenVar] ??
    (() => {
      throw new Error(`${discordTokenVar} is required`);
    })();

  const client = new discord.Client(options);
  client.on(discord.Events.ClientReady, () => {
    logger.info(`Logged in as ${client.user?.tag}`);
  });
  return client.login(discordToken)
    .then(() => client)
}

function getBullMqConnectionOptions() {
  const redisHostVar = "CHIMER_REDIS_HOST";
  const host = process.env[redisHostVar] ??
    (() => {
      throw new Error(`${redisHostVar} is required`);
    })();

  const redisPortVar = "CHIMER_REDIS_PORT";
  const port = process.env[redisPortVar] ??
    (() => {
      const defaultPort = "6379";
      debugLogger(`${redisPortVar} is not set, defaulting to ${defaultPort}`);
      return defaultPort;
    })();
  return {
    host,
    port: parseInt(port)
  };
}

function getWarehouseEndpoint() {
  const warehouseEndpointVar = "CHIMER_WAREHOUSE_ENDPOINT";
  return process.env[warehouseEndpointVar] ??
    (() => {
      throw new Error(`${warehouseEndpointVar} is required`);
    })();
}

async function main() {
  logger.info("Starting application");

  const redisConnectionOptions = getBullMqConnectionOptions();
  const warehouseEndpoint = getWarehouseEndpoint();

  /* This should be done as late as possible to avoid unnecessary logins
  to Discord. If you log in too often, you will be rate limited */
  const discordClient = await createDiscordClient();

  new bullmq.Worker<SoundCronJob>("soundCron", async (job) => {
    const { serverId, name, audio, mute } = job.data;
    const key = `${serverId}:${name}`;
    logger.info(`Running soundcron ${key}`);
    logger.info(`Playing audio ${audio} in server ${serverId}`);
    const guild = await discordClient.guilds.fetch(serverId);
    const maxChannel = largestVoiceChannel(guild);
 
    if (maxChannel.members.size === 0) {
      logger.info("No voice channels have members - leaving");
      return;
    }
  
    logger.info(
      `Found voice channel ${maxChannel.name} with ${maxChannel.members.size} members`,
    );
    const audioEndpoint = `${warehouseEndpoint}/soundcron/${serverId}/${encodeURIComponent(audio)}`;
    const { body } = await undici.request(audioEndpoint);
    const resource = discordVoice.createAudioResource(body);
    const connection = discordVoice.joinVoiceChannel({
      channelId: maxChannel.id,
      guildId: maxChannel.guild.id,
      adapterCreator: maxChannel.guild.voiceAdapterCreator,
    });
    try {
      await discordVoice.entersState(
        connection,
        discordVoice.VoiceConnectionStatus.Ready,
        10000,
      );
    } catch (err) {
      logger.error(`Failed to join voice channel: ${err}`);
      connection.destroy();
      return;
    }
    const subscription = connection.subscribe(audioPlayer);
    if (subscription === undefined) {
      logger.error("Failed to subscribe to audio player - investigation required");
      return;
    }

    try {
      if (mute) {
        await muteMembers(maxChannel);
      }

      logger.info("Subscribed to audio player");
      audioPlayer.play(resource);
      await discordVoice.entersState(
        audioPlayer,
        discordVoice.AudioPlayerStatus.Playing,
        10000,
      );
      logger.info("Playing audio");
      const hour = 60 * 60 * 1000;
      await discordVoice.entersState(
        audioPlayer,
        discordVoice.AudioPlayerStatus.Idle,
        hour,
      );
      connection.destroy();
    } catch (err) {
      logger.error(`An error occurred while playing audio: ${err}`);
      if (mute) {
        await unmuteMembers(maxChannel);
      }
    }
  }, {
    connection: redisConnectionOptions
  })
    .on('error', (err) => {
      logger.error(`An error occurred while processing soundcron: ${err}`);
    })
    .on('completed', (job) => {
      logger.info(`Completed soundcron ${job.name}`);
    }); 
  logger.info("Application started");
}

main().catch((err) => {
  if (err instanceof Error) {
    logger.error(err.message);
  } else {
    logger.error("An unknown error occurred - error not an instance of Error");
  }
  process.exit(1);
});
