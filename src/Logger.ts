import winston from "winston";

/**
 * The Logger for the application.
 * This just streams to the console in adherence to the 12-factor app.
 */
const Logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

export default Logger;
