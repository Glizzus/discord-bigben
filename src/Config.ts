import dotenv from 'dotenv';

dotenv.config();

if (!process.env['TOKEN']) {
  throw new Error("TOKEN is undefined");
}

if (!process.env['GUILD_ID']) {
  throw new Error("GUILD_ID is undefined");
}

if (!process.env['AUDIO_FILE']) {
  throw new Error("AUDIO_FILE is undefined");
}

if (!process.env['CRON']) {
  throw new Error("CRON is undefined");
}

const Config = {
  token: process.env.TOKEN,
  guildId: process.env.GUILD_ID,
  audioFile: process.env.AUDIO_FILE,
  cron: process.env.CRON
} as const;

export default Config;