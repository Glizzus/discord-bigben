import dotenv from "dotenv";
import Environment from "./Environment";

dotenv.config();

if (!process.env["TOKEN"]) {
  throw new Error("TOKEN is undefined");
}

if (!process.env["GUILD_ID"]) {
  throw new Error("GUILD_ID is undefined");
}

if (!process.env["AUDIO_FILE"]) {
  throw new Error("AUDIO_FILE is undefined");
}

if (!process.env["NODE_ENV"]) {
  console.log('NODE_ENV is undefined... defaulting to development')
}

const Config = {
  token: process.env.TOKEN,
  guildId: process.env.GUILD_ID,
  audioFile: process.env.AUDIO_FILE,
  environment: process.env["NODE_ENV"] ?? Environment.Development,
} as const

export default Config;
