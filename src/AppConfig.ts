import dotenv from "dotenv";
import Environment from "./Environment";
import Logger from "./Logger";

const environment =
  process.env["NODE_ENV"]?.toLowerCase() ??
  (() => {
    const defaultEnv = Environment.Development;
    console.log(`NODE_ENV is undefined... defaulting to ${defaultEnv}`);
    return defaultEnv;
  })();

// We are only going to respect the .env file in development mode.
if (environment === Environment.Development) {
  dotenv.config();
}

if (!process.env["BIGBEN_TOKEN"]) {
  throw new Error("BIGBEN_TOKEN is undefined. Unable to continue");
}

/**
 * The configuration for the bot.
 */
const AppConfig = {
  /**
   * The token to use to log in to Discord.
   */
  token: process.env.BIGBEN_TOKEN,

  /**
   * The environment we are running in.
   * See {@link Environment} for more information.
   */
  environment,
} as const;

Logger.info("Loaded config");
Logger.info(`Environment: ${AppConfig.environment}`);

export default AppConfig;
