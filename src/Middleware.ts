import {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import winston from "winston";

/**
 * A middleware that logs all requests.
 * @param logger the Winston logger to use
 * @returns the middleware function
 */
export function logAll(logger: winston.Logger) {
  return (req: Request, _res: Response, next: NextFunction) => {
    logger.http(`${req.method} ${req.path}`);
    next();
  };
}

/**
 * A middleware that logs errors generically.
 * This should be the last resort for errors.
 * @param logger the Winston logger to use
 * @returns the middleware function
 */
export function logErrors(logger: winston.Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    logger.error(err);
    const statusCode = err.status ?? 500;
    res.status(statusCode).json({
      message: "An unexpected error occurred.",
    });
  };
}
