import winston from 'winston'
import Environment from './Environment';
import Config from './Config';

const transports: winston.LoggerOptions['transports'] = [
  new winston.transports.File({
    filename: 'logs/combined.log'
  }),
  new winston.transports.File({
    level: 'error',
    filename: 'logs/error.log'
  })
];

if (Config.debug) {
  transports.push(new winston.transports.Console({
    level: 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

const Logger = winston.createLogger({
  transports
});

export default Logger;

