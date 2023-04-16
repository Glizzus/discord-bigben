import {
  ChannelType,
  Client,
  ClientOptions,
  Collection,
  Events,
  GatewayIntentBits,
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

const options: ClientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
};

const client = new Client(options);

client
  .login(Config.token)
  .then(async () => {
    await new Promise<void>((res, rej) => {
      client.once(Events.Error, rej);
      client.once(Events.ClientReady, (c) => {
        console.log(`Ready! Logged in as ${c.user.tag}`);
        res();
      });
    });

    async function getGuild() {
      const guild = await client.guilds.fetch(Config.guildId);

      if (!guild) {
        throw new Error(`Unable to connect to guild ${Config.guildId}`);
      }
      return guild;
    }

    const guild = await getGuild();
    const voiceChannels = guild.channels.cache.filter(
      (chan) => chan.type === ChannelType.GuildVoice
    ) as Collection<string, VoiceChannel>;

    function channelWithMostUsers() {
      let maxChannel: VoiceChannel | null = null;
      for (const [_, channel] of voiceChannels) {
        if (!maxChannel || channel.members.size > maxChannel.members.size) {
          maxChannel = channel;
        }
      }
      return maxChannel;
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

    async function bell() {
      console.log("Preparing to ring the bell");

      const maxChannel = channelWithMostUsers();
      if (!maxChannel) {
        // There are no users in any voice channel
        return;
      }

      const setMuteAll = (mute: boolean, reason: string) => {
        const action = mute ? "Muting" : "Unmuting";
        const { members } = maxChannel;
        console.log(members.size);
        return Promise.all(
          members.map((member) => {
            console.log(`${action} member ${member.user.username}`);
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

    const job = new CronJob(Config.cron, bell, null, true, "America/Chicago");

    job.start();
  })
  .catch(console.error);
