import {
  ChannelType,
  Client,
  ClientOptions,
  Collection,
  Events,
  GatewayIntentBits,
  Guild,
  VoiceChannel,
} from "discord.js";
import Config from "./Config";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
} from "@discordjs/voice";
import { CronJob } from "cron";
import Logger from "./Logger";
import debug from 'debug';
import { readFile } from 'fs/promises';

const debugLogger = debug('discord-bigben');

const options: ClientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
}

const client = new Client(options);

async function initClient() {
  return new Promise<void>((res, rej) => {
    client.once(Events.Error, rej);
    client.once(Events.ClientReady, (c) => {
      Logger.info(`Logged in as ${c.user.tag}`);
      res();
    });
  })
}

async function getGuildById(guildId: string) {
  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    throw new Error(`Unable to connect to guild ${guildId}`);
  }
  return guild;
}

async function loadIds() {
  const ids = await readFile('../guilds.txt');
  return ids
    .toString()
    .split('\n')
    .map((line) => line.split('#')[0].trim());
}

const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Stop,
  },
});

const resource = () =>
  createAudioResource(Config.audioFile, {
    metadata: {
      title: "The Bell Chimes",
    },
  });

function getBellRunner(guild: Guild) {
  const voiceChannels = guild.channels.cache.filter(
      (chan) => chan.type === ChannelType.GuildVoice
    ) as Collection<string, VoiceChannel>;

  function channelWithMostUsers() {
    let maxChannel: VoiceChannel | null = null;
    for (const [_, channel] of voiceChannels) {
      if (!maxChannel || channel.members.size > maxChannel.members.size) {
        debugLogger(`New maximum channel: ${channel.name}`);
        maxChannel = channel;
      }
    }
    return maxChannel;
  }

  async function bell() {
    Logger.info("Looking to ring the bell.")

    const maxChannel = channelWithMostUsers();
    if (!maxChannel) {
      Logger.info("No users in the guild; aborting...");
      // There are no users in any voice channel
      return;
    }
    Logger.info(`Ringing the bell for channel ${maxChannel.name}`);

    const setMuteAll = (mute: boolean, reason: string) => {
      const action = mute ? "Muting" : "Unmuting";
      const { members } = maxChannel;
      return Promise.all(
        members.map((member) => {
          debugLogger(`${action} member ${member.user.username}`);
          return member.voice.setMute(mute, reason);
        })
      );
    };

    await setMuteAll(true, "The bell tolls");
    const connection = joinVoiceChannel({
      channelId: maxChannel.id,
      guildId: maxChannel.guildId,
      adapterCreator: maxChannel.guild.voiceAdapterCreator,
    });

    async function listener() {
      try {
        await setMuteAll(false, "The bell no longer tolls");
        player.removeListener(AudioPlayerStatus.Idle, listener);
        connection.disconnect();
      } catch (err) {
        console.error(err);
      }
    }

    const subscription = connection.subscribe(player);
    if (subscription) {
      player.play(resource());
      try {
        player.on(AudioPlayerStatus.Idle, listener);
      } catch (err) {
        console.error(err);
      }
    }
  }
  return bell;
}

client
  .login(Config.token)
  .then(async () => {
    await initClient();
    const createBellJob = (runner: () => Promise<void>) => {
      return new CronJob(Config.cron, runner, null, true, "America/Chicago");
    }
    const ids = await loadIds();
    await Promise.all(ids.map(async (id) => {
      const guild = await getGuildById(id);
      const runner = getBellRunner(guild);
      const bellJob = createBellJob(runner);
      Logger.info(`Beginning toll job on guild ${id} with cron ${Config.cron}`);
      bellJob.start()
    }))
  })
  .catch(Logger.error);
