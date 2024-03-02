import * as winston from "winston";
import debug from "debug";

/**
 * The main logger for the application. This is used for all structured logging.
 */
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

/**
 * A logger for debugging purposes. This logger is disabled by default.
 * It must be enabled by setting the `DEBUG` environment variable.
 * This is seperate from the main logger because we don't want to dependency inject
 * this, we can just import it from anywhere.
 */
export const debugLogger = debug("chimer");
