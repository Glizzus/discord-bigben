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

const port = process.env["BIGBEN_PORT"] ?? (() => {
  if (environment !== Environment.Development) {
    throw new Error("BIGBEN_PORT is undefined. Unable to continue");
  }
  const defaultPort = 3000;
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

const mongoUri = process.env["BIGBEN_MONGO_URI"] ?? (() => {
  const defaultUri = "mongodb://localhost:27017";
  console.log(`MONGO_URI is undefined... defaulting to ${defaultUri}`);
  return defaultUri;
})();

/**
 * The configuration for the bot.
 */
const AppConfig = {
  /**
   * The token to use to log in to Discord.
   */
  token: process.env.BIGBEN_TOKEN,

  /**
   * The port to listen on.
   */
  port,

  /**
   * The URI to use to connect to MongoDB.
   */
  mongoUri,

  /**
   * The environment we are running in.
   * See {@link Environment} for more information.
   */
  environment,
} as const;

Logger.info("Loaded config");
Logger.info(`Environment: ${AppConfig.environment}`);

export default AppConfig;
