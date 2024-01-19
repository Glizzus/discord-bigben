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


async function login(client: discord.Client, token: string) {
  client.login(token);
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

  await Promise.race([successPromise, errorPromise]);

  // By this point, we have logged in. We can undo the error listener.
  client.removeAllListeners(discord.Events.Error);
}

async function retrieveGuild(client: discord.Client, guildId: string) {
  const guild = await client.guilds.fetch(guildId);
  if (!guild) {
    throw new Error(`Unable to connect to guild ${guildId}`);
  }
  debugLogger(`Connected to guild ${guild.name}`);
  return guild;
}

async function getMaxVoiceChannel(guild: discord.Guild): Promise<discord.VoiceChannel | null> {
  debugLogger("Finding voice channels")
  // We could use a filter, but I don't want to typecast. A for loop is fine.
  const voiceChannels = []
  for (const [_, channel] of guild.channels.cache) {
    if (channel.type === discord.ChannelType.GuildVoice) {
      voiceChannels.push(channel);
    }
  }

  let maxChannel: discord.VoiceChannel | null = null;
  let sizeCandidate = 0;

  for (const channel of voiceChannels) {
    const { name, members: { size } } = channel;
    if (channel.members.size > sizeCandidate) {
      debugLogger(`Found channel ${name} with ${size} members`);
      maxChannel = channel;
      sizeCandidate = size;
    }
  }
  return maxChannel;
}

export default async function toll() {

  const client = new discord.Client(options);

  // This can throw, but if it does, we want to crash the process.
  await login(client, Config.token);

  // This also should crash
  const guild = await retrieveGuild(client, Config.guildId);

  const maxChannel = await getMaxVoiceChannel(guild);
  if (!maxChannel) {
    debugLogger("No voice channels found. Exiting");
    return;
  }

  const resource = discordVoice.createAudioResource(Config.audioFile, {
    metadata: {
      title: "The Bell Chimes",
    }
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
    await new Promise<void>((resolve, reject) => {
      audioPlayer.play(resource);
      audioPlayer.on(discordVoice.AudioPlayerStatus.Idle, () => {
        Promise.all(
          members.map((member) => {
            debugLogger(`Unmuting member ${member.user.username}`);
            return member.voice.setMute(false, "The bell no longer tolls");
          })
        )
        .then(() => {
          audioPlayer.removeAllListeners(discordVoice.AudioPlayerStatus.Idle);
          resolve();
        })
        .catch((e) => reject(e));
      });
    }); 
    connection.disconnect();
  }
}
