import winston from 'winston'

const transports: winston.LoggerOptions['transports'] = [
  new winston.transports.File({
    filename: 'logs/combined.log'
  }),
  new winston.transports.File({
    level: 'error',
    filename: 'logs/error.log'
  })
];

const Logger = winston.createLogger({
  transports
});

export default Logger;

