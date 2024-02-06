import discord from "discord.js";
import * as discordVoice from "@discordjs/voice";
import cron from "cron";
import { Readable } from "stream";

import { debugLogger } from "./debugLogger";
import { AudioResourceType, determineType } from "./AudioResourceType";
import { SoundCronConfig } from "./ScheduleConfig";

/**
 * A worker runs one cron job.
 * One server can have multiple workers.
 */
export class Worker {
  private _cachedAudioPlayer: discordVoice.AudioPlayer | null = null;
  private get audioPlayer() {
    if (this._cachedAudioPlayer === null) {
      this._cachedAudioPlayer = discordVoice.createAudioPlayer({
        behaviors: {
          noSubscriber: discordVoice.NoSubscriberBehavior.Stop,
        },
      });
    }
    return this._cachedAudioPlayer;
  }

  private job: cron.CronJob | null = null;
  private readonly guild: discord.Guild;

  private readonly cronExpression: string;
  private readonly audioFile: string;
  private readonly excludeChannels: string[];
  private readonly mute: boolean;

  constructor(guild: discord.Guild, scheduleInterval: SoundCronConfig) {
    this.guild = guild;

    this.cronExpression = scheduleInterval.cron;
    this.audioFile = scheduleInterval.audio;
    this.excludeChannels = scheduleInterval.excludeChannels ?? [];
    this.mute = scheduleInterval.mute ?? false;
  }

  private instanceDebug(message: string) {
    debugLogger(`[${this.guild.name}] ${message}`);
  }

  private muteAll(members: discord.Collection<string, discord.GuildMember>) {
    return Promise.all(
      members.map((member) => {
        this.instanceDebug(`Muting member ${member.user.username}`);
        return member.voice.setMute(true, "The bell tolls");
      }),
    );
  }

  private unmuteAll(members: discord.Collection<string, discord.GuildMember>) {
    return Promise.all(
      members.map((member) => {
        this.instanceDebug(`Unmuting member ${member.user.username}`);
        return member.voice.setMute(false, "The bell is done tolling");
      }),
    );
  }

  public async runOnce() {
    const voiceChannel = this.getMaxVoiceChannel();
    if (voiceChannel === null) {
      throw new Error("Unable to find a voice channel to connect to");
    }
    if (this.excludeChannels.includes(voiceChannel.id)) {
      return;
    }
    const audioResource = await this.resourceFromUrl();
    const connection = discordVoice.joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
    });

    const { members } = voiceChannel;

    // I copy this variable in fear of it changing - it shouldn't
    const doMute = this.mute;

    if (doMute) {
      await Promise.all([
        this.muteAll(members),
        new Promise((res) => setTimeout(res, 1000))
      ]);
    } else {
      // TODO: We shouldn't need to sleep, but it doesn't work without it.
      await new Promise((res) => setTimeout(res, 1000));
    }

    this.audioPlayer.play(audioResource);
    const subscription = connection.subscribe(this.audioPlayer);
    if (subscription === undefined) {
      this.instanceDebug("Unable to subscribe to voice connection");
      return;
    }

    this.instanceDebug("Waiting for audio player to start playing");
    await discordVoice.entersState(
      this.audioPlayer,
      discordVoice.AudioPlayerStatus.Playing,
      20_000,
    );
    this.instanceDebug("Waiting for audio player to stop playing");
    await discordVoice.entersState(
      this.audioPlayer,
      discordVoice.AudioPlayerStatus.Idle,
      30_000,
    );
    
    if (doMute)
    {
      await this.unmuteAll(members);
    }

    this.instanceDebug("Disconnecting from voice channel");
    connection.destroy();
  }

  public run() {
    this.instanceDebug(`Running on cron expression ${this.cronExpression}`);
    const job = new cron.CronJob(
      this.cronExpression,
      () => {
        (async () => {
          try {
            await this.runOnce();
          } catch (e) {
            this.instanceDebug(`Error running job: ${e}`);
          }
        })();
      },
      undefined,
      true,
      "America/Chicago",
    );
    this.job = job;
    job.start();
  }

  private getMaxVoiceChannel(): discord.VoiceChannel | null {
    this.instanceDebug("Finding voice channels");
    // We could use a filter, but I don't want to typecast. A for loop is fine.
    const voiceChannels = [];
    for (const [_, channel] of this.guild.channels.cache) {
      if (channel.type === discord.ChannelType.GuildVoice) {
        voiceChannels.push(channel);
      }
    }

    let maxChannel: discord.VoiceChannel | null = null;
    let sizeCandidate = 0;

    for (const channel of voiceChannels) {
      const {
        name,
        members: { size },
      } = channel;
      if (channel.members.size > sizeCandidate) {
        this.instanceDebug(`Found channel ${name} with ${size} members`);
        maxChannel = channel;
        sizeCandidate = size;
      }
    }
    return maxChannel;
  }

  private async resourceFromUrl() {
    const resourceType = determineType(this.audioFile);
    switch (resourceType) {
      case AudioResourceType.File:
        return discordVoice.createAudioResource(this.audioFile);

      case AudioResourceType.Stream: {
        this.instanceDebug(`Streaming audio from ${this.audioFile}`);
        const stream = await this.urlToNodeStream(this.audioFile);
        return discordVoice.createAudioResource(stream);
      }
    }
  }

  private async *streamToAsyncIterable<T>(stream: ReadableStream<T>) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async urlToNodeStream(url: string) {
    const response = await fetch(url);
    const blob = await response.blob();
    const stream = blob.stream();
    const asyncIterable = this.streamToAsyncIterable(stream);
    const nodeStream = Readable.from(asyncIterable);
    return nodeStream;
  }

  public stop() {
    this.job?.stop();
  }
}
