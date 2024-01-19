import dotenv from "dotenv";
import Environment from "./Environment";
import Logger from "./Logger";

const environment = process.env["NODE_ENV"]?.toLowerCase() ?? (() => {
  const defaultEnv = Environment.Development;
  console.log(`NODE_ENV is undefined... defaulting to ${defaultEnv}`)
  return defaultEnv;
})();

// We are only going to respect the .env file in development mode.
if (environment === Environment.Development) {
  dotenv.config();
}

if (!process.env["BIGBEN_TOKEN"]) {
  throw new Error("BIGBEN_TOKEN is undefined. Unable to continue");
}

if (!process.env["BIGBEN_GUILD_ID"]) {
  throw new Error("BIGBEN_GUILD_ID is undefined");
}

if (!process.env["BIGBEN_AUDIO_FILE"]) {
  throw new Error("BIGBEN_AUDIO_FILE is undefined");
}

const Config = {
  token: process.env.BIGBEN_TOKEN,
  guildId: process.env.BIGBEN_GUILD_ID,
  audioFile: process.env.BIGBEN_AUDIO_FILE,
  environment,
} as const

Logger.info("Loaded config");
Logger.info(`Environment: ${Config.environment}`);
Logger.info(`Audio file: ${Config.audioFile}`)

export default Config;
