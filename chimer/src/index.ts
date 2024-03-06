import * as bullmq from "bullmq";
import * as discord from "discord.js";
import * as discordVoice from "@discordjs/voice";
import * as undici from "undici";
import { debugLogger, logger } from "./logging";
import winston from "winston";
import { type SoundCronJob } from "@discord-bigben/types";
import { Redis } from "ioredis";
import { CronJob } from "cron";
import { randomUUID } from "crypto";
import { escape } from "querystring";

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

const discordToken =
  process.env.DISCORD_TOKEN ??
  (() => {
    throw new Error("DISCORD_TOKEN is required");
  })();

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

const workerId = randomUUID();
function processorFactory(
  discordClient: discord.Client,
  logger: winston.Logger,
) {
  return async (job: bullmq.Job<SoundCronJob>) => {
    // Information that we will send as our heartbeat.
    // This is not essential, but it is a more useful heartbeat than just the job id.
    let lastRan: Date | null = null;
    let timesActivated = 0;

    const workFunction = async () => {

      // Update the heartbeat information
      timesActivated++;
      lastRan = new Date();

      const { serverId, audio, mute } = job.data;
      debugLogger(`Playing audio ${audio} in server ${serverId}`);
      const guild = await discordClient.guilds.fetch(serverId);
      const maxChannel = largestVoiceChannel(guild);
      if (maxChannel.members.size === 0) {
        debugLogger("No voice channels found - leaving");
        return;
      }
      debugLogger(`Found voice channel ${maxChannel.name} with ${maxChannel.members.size} members`);
      const { body } = await undici.request(audio);
      const resource = discordVoice.createAudioResource(body);
      const connection = discordVoice.joinVoiceChannel({
        channelId: maxChannel.id,
        guildId: maxChannel.guild.id,
        adapterCreator: maxChannel.guild.voiceAdapterCreator,
      });

      // We need to ensure that the users get unmuted no matter what
      try {
        if (mute) {
          debugLogger("Muting all members in the voice channel");
          await Promise.all(
            maxChannel.members.map((member) => {
              debugLogger(`Muting ${member.user.tag}`);
              return member.voice.setMute(true, "The bell tolls for thee");
            }),
          );
        }

        audioPlayer.play(resource);
        const subscription = connection.subscribe(audioPlayer);
        if (subscription === undefined) {
          logger.error(
            "Failed to subscribe to audio player - investigation required",
          );
          return;
        }
        debugLogger("Subscribed to audio player");
        await new Promise((resolve) => {
          setTimeout(resolve, 2000);
        });
        // It takes a while for the audio player to start playing the resource
        await discordVoice.entersState(
          audioPlayer,
          discordVoice.AudioPlayerStatus.Playing,
          10000,
        );
        debugLogger("Playing audio");
        const hour = 60 * 60 * 1000;
        await discordVoice.entersState(
          audioPlayer,
          discordVoice.AudioPlayerStatus.Idle,
          hour,
        );
      } finally {
        if (mute) {
          await Promise.all(
            maxChannel.members.map((member) => {
              debugLogger(`Unmuting ${member.user.tag}`);
              return member.voice.setMute(false, "The bell is done tolling");
            }),
          );
        }
        connection.destroy();
      }
    };
    const { serverId, name, cron, timezone } = job.data;
    const workJob = new CronJob(cron, workFunction, null, true, timezone);
    const heartBeatJob = new CronJob(
      "*/5 * * * * *",
      () => {
        const key = `${serverId}:${name}`
        job.updateProgress({ workerId, key, lastRan, timesActivated });
      },
      null,
      true,
      timezone,
    );
    // Ensure job never finishes
    await new Promise(() => {});
  };
}

function setupWorker(
  redis: Redis,
  discordClient: discord.Client,
  logger: winston.Logger,
): bullmq.Worker<SoundCronJob> {
  return new bullmq.Worker(
    "soundCron",
    processorFactory(discordClient, logger),
    {
      connection: redis,
      autorun: false,
    },
  )
    .on("ready", () => {
      debugLogger("Worker is ready");
    })
    .on("completed", ({ id }) => {
      debugLogger(`Job ${id} has completed`);
    })
    .on("failed", (job, err) => {
      if (job) {
        const { id, data } = job;
        debugLogger(
          `Job ${id} has failed with ${err} - soundCron = ${JSON.stringify(data)}`,
        );
      } else {
        debugLogger(`A job has failed with ${err} - no job data available`);
      }
    });
}

async function main() {
  logger.info("Starting application");

  const discordClient = new discord.Client(options);
  discordClient.on(discord.Events.ClientReady, () => {
    logger.info(`Logged in as ${discordClient.user?.tag}`);
  });
  await discordClient.login(discordToken);

  const redisHost =
    process.env.REDIS_HOST ??
    (() => {
      throw new Error("REDIS_HOST is required");
    })();

  const redisPort =
    process.env.REDIS_PORT ??
    (() => {
      const defaultPort = "6379";
      logger.warn(`REDIS_PORT is not set, defaulting to ${defaultPort}`);
      return defaultPort;
    })();

  const redisConn = new Redis(parseInt(redisPort), redisHost, {
    // I had to set this to null because it errors if I don't
    maxRetriesPerRequest: null
  });
  await redisConn.ping();
  debugLogger(`Successfully pinged redis at ${redisHost}:${redisPort}`);

  debugLogger(
    `Creating worker connection to redis at ${redisHost}:${redisPort}`,
  );
  const worker = setupWorker(redisConn, discordClient, logger);
  await worker.run();
}

main().catch((err) => {
  if (err instanceof Error) {
    logger.error(err.message);
  } else {
    logger.error("An unknown error occurred - error not an instance of Error");
  }
  process.exit(1);
});
