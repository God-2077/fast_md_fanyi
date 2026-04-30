/**
 * 日志模块 - 基于 pino 的统一日志记录
 * 支持美化输出 (pino-pretty) 和可选的 JSON 文件输出
 * 
 * pino 根 logger 实现为单例，所有 Logger 实例共享同一个 pino 实例，
 * 避免多个 transport 同时写入同一文件导致内容交错和文件句柄泄漏。
 */

import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { logConfig } from '../config';

let sharedPino: pino.Logger | null = null;

function getPinoSingleton(level: string): pino.Logger {
  if (!sharedPino) {
    const targets: pino.TransportTargetOptions[] = [
      {
        target: 'pino-pretty',
        level,
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
        level,
        options: { destination: logConfig.filePath },
      });
    }

    sharedPino = pino({
      level,
      transport: { targets },
    });
  }
  return sharedPino;
}

export class Logger {
  private pinoInstance: pino.Logger;
  private prefix: string;

  constructor(_level: string = 'info', prefix: string = '') {
    this.prefix = prefix;
    this.pinoInstance = getPinoSingleton(_level);
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
    return new Logger('', nestedPrefix);
  }
}
