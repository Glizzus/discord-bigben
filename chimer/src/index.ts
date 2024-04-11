import * as bullmq from "bullmq";
import * as discord from "discord.js";
import * as discordVoice from "@discordjs/voice";
import * as undici from "undici";
import { debugLogger, logger } from "./logging";
import winston from "winston";
import { type SoundCronJob } from "@discord-bigben/types";
import { Redis } from "ioredis";
import { CronJob } from "cron";
import { UUID, randomUUID } from "crypto";
import { RedisWorkerMediator } from "./RedisWorkerMediator";

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

export interface SoundCronJobEstablished {
  key: string;
  workerId: UUID;
}

// TODO: Make this stateless by storing the taken keys in redis
const takenKeys = new Set<string>();

async function muteMembers(guild: discord.VoiceBasedChannel) {
  await Promise.all(
    guild.members.map((member) => {
      debugLogger(`Muting ${member.user.tag}`);
      return member.voice.setMute(true, "The bell tolls");
    }),
  );
}

async function unmuteMembers(guild: discord.VoiceBasedChannel) {
  await Promise.all(
    guild.members.map((member) => {
      debugLogger(`Unmuting ${member.user.tag}`);
      return member.voice.setMute(false, "The bell is done tolling");
    }),
  );
}

function processorFactory(
  workerId: UUID,
  redis: Redis,
  discordClient: discord.Client,
  logger: winston.Logger,
) {
  return async (job: bullmq.Job<SoundCronJob, SoundCronJobEstablished>) => {
    const { serverId, name, cron, timezone } = job.data;
    const key = `${serverId}:${name}`;
    if (takenKeys.has(key)) {
      logger.error(`Soundcron ${key} is already taken by this worker.`);
    } else {
      takenKeys.add(key);
      logger.info(`Worker ${workerId} is taking soundcron ${key}`)

      new CronJob(
        cron,
        async function () {
          /* If this soundCron has been removed, then campa will place
          it in the removedSoundCrons set. If we find it there, we will
          stop the job and remove it from the set. */
          if (await redis.sismember("removedSoundCrons", key)) {
            logger.info(`Soundcron ${key} has been marked as removed - stopping`);
            this.stop();
            await redis.srem("removedSoundCrons", key);
            return;
          }

          if (await redis.sismember("deadWorkers", workerId)) {
            logger.info(`This worker ${workerId} has been marked as dead - worker is killing itself`);
            /* Screw recovery; if the orchestrator believes we're dead, we're dead.
            pm2, systemd, Docker, or whatever will restart us. */
            process.exit(0);
          }

          const masterHeartbeat = await redis.exists("heartbeat:master");
          if (masterHeartbeat === 0) {
            logger.info("Master heartbeat is missing - worker is killing itself");
            process.exit(0);
          }

          const { audio, mute } = job.data;
          debugLogger(`Playing audio ${audio} in server ${serverId}`);
          const guild = await discordClient.guilds.fetch(serverId);
          const maxChannel = largestVoiceChannel(guild);
          if (maxChannel.members.size === 0) {
            debugLogger("No voice channels found - leaving");
            return;
          }
          debugLogger(
            `Found voice channel ${maxChannel.name} with ${maxChannel.members.size} members`,
          );
          const { body } = await undici.request(audio);
          const resource = discordVoice.createAudioResource(body);
          const connection = discordVoice.joinVoiceChannel({
            channelId: maxChannel.id,
            guildId: maxChannel.guild.id,
            adapterCreator: maxChannel.guild.voiceAdapterCreator,
          });

          try {
            // We need to ensure that the users get unmuted no matter what
            if (mute) {
              await muteMembers(maxChannel);
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
              await unmuteMembers(maxChannel);
            }
            connection.destroy();
          }
        },
        null,
        true,
        timezone,
      );
    }
    return {
      key,
      workerId,
    };
  };
}

function setupWorker(
  workerId: UUID,
  redis: Redis,
  discordClient: discord.Client,
  logger: winston.Logger,
): bullmq.Worker<SoundCronJob, SoundCronJobEstablished> {
  return new bullmq.Worker(
    "soundCron",
    processorFactory(workerId, redis, discordClient, logger),
    {
      connection: redis,
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

async function createDiscordClient() {

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

  const client = new discord.Client(options);
  client.on(discord.Events.ClientReady, () => {
    logger.info(`Logged in as ${client.user?.tag}`);
  });
  return client.login(discordToken)
    .then(() => client)
}

async function createRedisClient() {
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
    maxRetriesPerRequest: null,
  });
  return redisConn.ping()
    .then(() => {
      debugLogger(`Successfully pinged redis at ${redisHost}:${redisPort}`);
      return redisConn;
    });
}

async function main() {
  logger.info("Starting application");

  const [discordClient, redisConn] = await Promise.all([
    createDiscordClient(),
    createRedisClient(),
  ]);

  const workerId = randomUUID();
  setupWorker(workerId, redisConn, discordClient, logger);

  const redisWorkerMediator = new RedisWorkerMediator(workerId, redisConn);

  // We make a seperate logger for the heartbeat because it's noisy
  const heartbeatDebugLogger = debugLogger.extend("heartbeat");

  new CronJob(
    "*/5 * * * * *",
    async () => {
      // If we have no keys, we don't need to send a heartbeat
      if (takenKeys.size === 0) {
        return
      }
      heartbeatDebugLogger(`Sending heartbeat for worker ${workerId}`);
      await redisWorkerMediator.heartbeat();
    },
    () => {
      logger.error("Heartbeat job completed - this should never happen");
    },
    true,
  );
}

main().catch((err) => {
  if (err instanceof Error) {
    logger.error(err.message);
  } else {
    logger.error("An unknown error occurred - error not an instance of Error");
  }
  process.exit(1);
});
