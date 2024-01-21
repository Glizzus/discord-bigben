import * as discord from 'discord.js'
import * as discordVoice from '@discordjs/voice';
import debugLogger from './debugLogger';
import winston from 'winston';
import AudioResourceType, { determineType } from './AudioResourceType';
import { Readable } from 'stream';

class Orchestrator {

  private readonly client: discord.Client;
  private readonly logger: winston.Logger;

  constructor(client: discord.Client, logger: winston.Logger) {
    this.client = client;
    this.logger = logger;
  }

  public async run(token: string) {
    this.client.login(token);
    debugLogger("Attempting to log in");

    const successPromise = new Promise<void>((res) => {
    this.client.once(discord.Events.ClientReady, (c) => {
      this.logger.info(`Logged in as ${c.user.tag}`);
      res();
      });
    });

    const errorListener = (_: unknown, rej: (error: Error) => void) => {
      this.client.once(discord.Events.Error, rej);
    }; 
    const errorPromise = new Promise<void>(errorListener);

    await Promise.race([successPromise, errorPromise]);

    // By this point, we have logged in. We can undo the error listener.
    this.client.removeListener(discord.Events.Error, errorListener);
  }
}

class Worker {

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

  private readonly guild: discord.Guild;
  private readonly audioFile: string;

  constructor(guild: discord.Guild, audioFile: string) {
    this.guild = guild;
    this.audioFile = audioFile;
  }

  private getMaxVoiceChannel(): discord.VoiceChannel | null {
    debugLogger("Finding voice channels")
    // We could use a filter, but I don't want to typecast. A for loop is fine.
    const voiceChannels = []
    for (const [_, channel] of this.guild.channels.cache) {
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

  private async resourceFromUrl() {
    const resourceType = determineType(this.audioFile);
    switch (resourceType) {
      case AudioResourceType.File:
        return discordVoice.createAudioResource(this.audioFile);
      
      case AudioResourceType.Stream: {
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
          return;
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
    return Readable.from(asyncIterable);
  }
}