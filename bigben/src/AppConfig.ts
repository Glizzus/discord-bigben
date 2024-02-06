import dotenv from "dotenv";
import Environment from "./Environment";
import { Logger } from "./Logger";

const environment =
  process.env["NODE_ENV"]?.toLowerCase() ??
  (() => {
    const defaultEnv = Environment.Development;
    console.log(`NODE_ENV is undefined... defaulting to ${defaultEnv}`);
    return defaultEnv;
  })();

const port =
  process.env["BIGBEN_PORT"] ??
  (() => {
    if (environment !== Environment.Development) {
      throw new Error("BIGBEN_PORT is undefined. Unable to continue");
    }
    const defaultPort = "3000";
    console.log(`BIGBEN_PORT is undefined... defaulting to ${defaultPort}`);
    return defaultPort;
  })();

// We are only going to respect the .env file in development mode.
if (environment === Environment.Development) {
  dotenv.config();
}

if (!process.env["BIGBEN_TOKEN"]) {
  throw new Error("BIGBEN_TOKEN is undefined. Unable to continue");
}

if (!process.env["BIGBEN_CLIENT_ID"]) {
  throw new Error("BIGBEN_CLIENT_ID is undefined. Unable to continue");
}

const mariaDbUri =
  process.env["BIGBEN_MARIADB_URI"] ??
  (() => {
    if (environment !== Environment.Development) {
      throw new Error("BIGBEN_MARIADB_URI is undefined. Unable to continue");
    }
    const defaultUri = "mariadb://mariadb:3306/bigben-dev"
    console.log(`BIGBEN_MARIADB_URI is undefined... defaulting to ${defaultUri}`);
    return defaultUri;
  })();

/**
 * The configuration for the bot.
 */
export const AppConfig = {
  /**
   * The token to use to log in to Discord.
   */
  token: process.env.BIGBEN_TOKEN,

  /**
   * The client ID of the bot.
   */
  clientId: process.env.BIGBEN_CLIENT_ID,

  /**
   * The port to listen on.
   */
  port,

  /**
   * The URI to use to connect to MongoDB.
   */
  mariaDbUri,

  /**
   * The environment we are running in.
   * See {@link Environment} for more information.
   */
  environment,
} as const;

Logger.info("Loaded config");
Logger.info(`Environment: ${AppConfig.environment}`);
