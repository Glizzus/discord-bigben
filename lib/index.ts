import * as discord from "discord.js";
import Config from "./Config";
import * as discordVoice from "@discordjs/voice";
import Logger from "./Logger";
import debug from 'debug';

const debugLogger = debug('discord-bigben');

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
}

const audioPlayer = discordVoice.createAudioPlayer({
  behaviors: {
    noSubscriber: discordVoice.NoSubscriberBehavior.Stop,
  },
});

export default async function run() {
  const client = new discord.Client(options);
  client.login(Config.token);

  debugLogger("Attempting to log in");
  const successPromise = new Promise<void>((res) => {
    client.once(discord.Events.ClientReady, (c) => {
      Logger.info(`Logged in as ${c.user.tag}`);
      res();
    })
  });

  const errorPromise = new Promise<void>((_, rej) => {
    client.once(discord.Events.Error, rej);
  });

  // We want to let the error get thrown if it happens
  await Promise.race([successPromise, errorPromise]);

  // By this point, we have logged in. We can undo the error listener.
  client.removeAllListeners(discord.Events.Error);

    const guild = await client.guilds.fetch(Config.guildId);
  if (!guild) {
    debugLogger(`Unable to connect to guild ${Config.guildId}`);
    throw new Error(`Unable to connect to guild ${Config.guildId}`);
  }
  debugLogger(`Connected to guild ${guild.name}`);

  debugLogger("Finding voice channels")
  // We could use a filter, but I don't want to typecast. A for loop is fine.
  const voiceChannels = []
  for (const [_, channel] of guild.channels.cache) {
    if (channel.type === discord.ChannelType.GuildVoice) {
      voiceChannels.push(channel);
    }
  }

  let maxChannel: discord.VoiceChannel | null = null;
  for (const channel of voiceChannels) {
    if (!maxChannel || channel.members.size > maxChannel.members.size) {
      debugLogger(`New maximum channel: ${channel.name}`);
      maxChannel = channel;
    }
  }
  if (!maxChannel) {
    // There are no users in any voice channel - this is not an error.
    return;
  }

  const resource = discordVoice.createAudioResource(Config.audioFile, {
    metadata: {
      title: "The Bell Chimes",
    },
  });

  const connection = discordVoice.joinVoiceChannel({
    channelId: maxChannel.id,
    guildId: maxChannel.guildId,
    adapterCreator: maxChannel.guild.voiceAdapterCreator,
  });

  const { members } = maxChannel;
  await Promise.all(
    members.map((member) => {
      debugLogger(`Muting member ${member.user.username}`);
      return member.voice.setMute(true, "The bell tolls");
    })
  );

  const subscription = connection.subscribe(audioPlayer);
  if (subscription) {
    audioPlayer.play(resource);
    audioPlayer.on(discordVoice.AudioPlayerStatus.Idle, () => {

      // We need a seperate async function because the parent function expects
      // a void return, not a Promise<void> return.
      async function unmuteMembers() {
        await Promise.all(
          members.map((member) => {
            debugLogger(`Unmuting member ${member.user.username}`);
            return member.voice.setMute(false, "The bell no longer tolls");
          })
        );
        connection.disconnect();
      }

      unmuteMembers();
    });
  }
}
