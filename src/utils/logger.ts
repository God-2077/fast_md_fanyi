/**
 * 日志模块 - 基于 pino 的统一日志记录
 * 支持美化输出 (pino-pretty) 和可选的 JSON 文件输出
 */

import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { logConfig } from '../config';

function createPino(logLevel: string): pino.Logger {
  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-pretty',
      level: logLevel,
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
        errorProps: 'stack',
      },
    },
  ];

  if (logConfig.writeToFile) {
    const logDir = path.dirname(logConfig.filePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    targets.push({
      target: 'pino/file',
      level: logLevel,
      options: { destination: logConfig.filePath },
    });
  }

  return pino({
    level: logLevel,
    transport: {
      targets,
    },
  });
}

export class Logger {
  private pinoInstance: pino.Logger;
  private level: string;
  private prefix: string;

  constructor(level: string = 'info', prefix: string = '') {
    this.level = level;
    this.prefix = prefix;
    this.pinoInstance = createPino(level);
  }

  private fmt(message: string): string {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }

  debug(message: string, ...args: unknown[]): void {
    if (args.length > 0) {
      this.pinoInstance.debug(
        this.fmt(`${message} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`)
      );
    } else {
      this.pinoInstance.debug(this.fmt(message));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (args.length > 0) {
      this.pinoInstance.info(
        this.fmt(`${message} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`)
      );
    } else {
      this.pinoInstance.info(this.fmt(message));
    }
  }

  warn(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.pinoInstance.warn({ err: error }, this.fmt(message));
    } else if (error !== undefined) {
      this.pinoInstance.warn(this.fmt(`${message} ${JSON.stringify(error)}`));
    } else {
      this.pinoInstance.warn(this.fmt(message));
    }
  }

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.pinoInstance.error({ err: error }, this.fmt(message));
    } else if (error !== undefined) {
      this.pinoInstance.error(this.fmt(`${message} ${JSON.stringify(error)}`));
    } else {
      this.pinoInstance.error(this.fmt(message));
    }
  }

  child(prefix: string): Logger {
    const nestedPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger(this.level, nestedPrefix);
  }
}
