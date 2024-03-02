import * as bullmq from "bullmq";
import * as discord from "discord.js";
import * as discordVoice from "@discordjs/voice";
import * as undici from "undici";
import { debugLogger, logger } from "./logging";
import winston from "winston";
import { parseArgs } from "node:util";

export interface SoundCronJob {
  serverId: string;
  audio: string;
  mute: boolean;
}

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

parseArgs({ args: [], options: {
  "once": {
    type : "boolean",
    short: "o",
  },
  "audio": {
    type: "string",
    short: "a",
  },
  "serverId": {
    type: "string",
    short: "s",
  },
  "channelId": {
    type: "string",
    short: "c",
  },
}, allowPositionals: true })

function processorFactory(
  discordClient: discord.Client,
  logger: winston.Logger,
) {
  return async (job: bullmq.Job<SoundCronJob>) => {
    const { serverId, audio, mute } = job.data;
    debugLogger(`Playing audio ${audio} in server ${serverId}`);
    const guild = await discordClient.guilds.fetch(serverId);
    const voiceChannels = [];
    for (const [_, channel] of guild.channels.cache) {
      if (channel.type === discord.ChannelType.GuildVoice) {
        voiceChannels.push(channel);
      }
    }

    // Find the voice channel with the most members
    let maxChannel: discord.VoiceChannel | null = null;
    let sizeCandidate = 0;

    debugLogger(
      `Found ${voiceChannels.length} voice channels - searching for the largest`,
    );
    for (const channel of voiceChannels) {
      const {
        name,
        members: { size },
      } = channel;
      if (size > sizeCandidate) {
        debugLogger(`Found a larger channel: ${name} with ${size} members`);
        maxChannel = channel;
        sizeCandidate = size;
      }
    }
    job.updateProgress(1);
    if (!maxChannel) {
      debugLogger("No voice channels found - leaving");
      return;
    }
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
      job.updateProgress(1);
      await new Promise((resolve) => { setTimeout(resolve, 1000); });
      // It takes a while for the audio player to start playing the resource
      await discordVoice.entersState(
        audioPlayer,
        discordVoice.AudioPlayerStatus.Playing,
        10000,
      );
      job.updateProgress(1);
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
}

async function main() {
  logger.info("Starting application");

  const discordClient = new discord.Client(options);
  const clientLoggedIn = discordClient.login(discordToken);

  discordClient.on("ready", () => {
    debugLogger(`Logged in as ${discordClient.user?.tag}`);
  });

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

  debugLogger(
    `Creating worker connection to redis at ${redisHost}:${redisPort}`,
  );
  const worker = new bullmq.Worker(
    "soundCron",
    processorFactory(discordClient, logger),
    {
      connection: {
        host: redisHost,
        port: parseInt(redisPort),
      },
      autorun: false,
    },
  );
  debugLogger("Worker created and connected, but not yet running");

  worker.on("ready", () => {
    debugLogger("Worker is ready");
  });

  worker.on("completed", (job) => {
    debugLogger(`Job ${job.id} has completed`);
  });

  worker.on("failed", (job, err) => {
    if (job) {
      debugLogger(
        `Job ${job.id} has failed with ${err} - soundCron = ${JSON.stringify(job.data)}`,
      );
    } else {
      debugLogger(`A job has failed with ${err} - no job data available`);
    }
  });

  // Only now do we need the client to be logged in
  await clientLoggedIn;
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
