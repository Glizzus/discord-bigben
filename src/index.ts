import { ChannelType, Client, ClientOptions, Collection, Events, GatewayIntentBits, GuildBasedChannel, ThreadMemberManager, VoiceChannel } from 'discord.js';
import Config from './Config';
import { AudioPlayerStatus, NoSubscriberBehavior, createAudioPlayer, createAudioResource, joinVoiceChannel } from '@discordjs/voice';
import { CronJob } from 'cron';
import path from 'path';

(async () => {

  const options: ClientOptions = {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates
    ]
  }

  const client = new Client(options);

  await client.login(Config.token);

  await new Promise<void>((res, rej) => {
    client.once(Events.Error, rej)
    client.once(Events.ClientReady, (c) => {
      console.log(`Ready! Logged in as ${c.user.tag}`);
      res();
    });
  })

  async function getGuild() {
    const guild = await client.guilds.fetch(Config.guildId);

    if (!guild) {
      throw new Error(`Unable to connect to guild ${Config.guildId}`);
    }
    return guild;
  }

  const guild = await getGuild();
  console.log('My guild: ')
  const voiceChannels = guild.channels.cache.filter((chan) => chan.type === ChannelType.GuildVoice) as Collection<string, VoiceChannel>;

  function channelWithMostUsers() {
    console.log('Finding channel with most users');
    let maxChannel: VoiceChannel | null = null; 
    for (const [_, channel] of voiceChannels) {
      console.log('Trying channel ', channel.name);
      if (!maxChannel || channel.members.size > maxChannel.members.size) {
        console.log('New max: ', channel.name);
        maxChannel = channel;
      }
    }
    console.log('Final max: ', maxChannel?.name);
    return maxChannel;
  }

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Stop
    }
  });

  const resource = () => createAudioResource(path.join(__dirname, '..', 'bell.mp3'), {
    metadata: {
      title: 'The Bell Chimes'
    }
  });

  async function bell() {

    console.log('Preparing to ring the bell');

    const maxChannel = channelWithMostUsers();
    if (!maxChannel) {
      // There are no users in any voice channel
      return;
    }
    const connection = joinVoiceChannel({
      channelId: maxChannel.id,
      guildId: maxChannel.guildId,
      adapterCreator: maxChannel.guild.voiceAdapterCreator
    });
    const setMuteAll = (mute: boolean, reason: string) => {
      return Promise.all(maxChannel.members.map((user) => {
        return user.voice.setMute(mute, reason);
      }));
    }
    console.log('Muting all');
    await setMuteAll(true, 'The bell tolls');
    player.on(AudioPlayerStatus.Idle, async () => {
      await setMuteAll(false, 'The bell no longer tolls');
      connection.destroy();
    });
    console.log('Playing the tune');
    connection.subscribe(player);
    player.play(resource());
  }

  const job = new CronJob(
    Config.cron,
    bell,
    null,
    true,
    'America/Chicago'
  );

  job.start();

})();
