import pino, { Logger as PinoLogger } from 'pino';
import type { LogConfig } from '../types';

export type Logger = PinoLogger;

interface TransportTarget {
  target: string;
  options?: Record<string, unknown>;
}

export function createLogger(config: LogConfig, name?: string): Logger {
  const targets: TransportTarget[] = [{
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
      errorProps: 'stack',
    },
  }];

  if (config.outputToFile) {
    targets.push({
      target: 'pino/file',
      options: {
        destination: config.filePath,
      },
    });
  }

  const baseLogger = pino({
    level: config.level,
    transport: {
      targets,
    },
  });

  return name ? baseLogger.child({ name }) : baseLogger;
}

export const globalLogger = createLogger({
  level: 'info',
  outputToFile: false,
  filePath: './logs/app.log',
}, 'app');