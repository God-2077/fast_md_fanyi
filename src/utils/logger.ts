/**
 * 日志模块 - 提供统一的日志记录功能
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

/**
 * 日志记录器类
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(level: 'debug' | 'info' | 'warn' | 'error' = 'info', prefix = '') {
    this.prefix = prefix;
    this.level = this.parseLevel(level);
  }

  private parseLevel(level: string): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };
    return levelMap[level] ?? LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelName = LEVEL_NAMES[level];
    const prefixStr = this.prefix ? `[${this.prefix}] ` : '';
    return `${timestamp} ${levelName} ${prefixStr}${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
      console.debug(this.formatMessage(LogLevel.DEBUG, message + formattedArgs));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
      console.info(this.formatMessage(LogLevel.INFO, message + formattedArgs));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
      console.warn(this.formatMessage(LogLevel.WARN, message + formattedArgs));
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorInfo = error instanceof Error 
        ? `\n  Error: ${error.message}\n  Stack: ${error.stack}`
        : error ? `\n  Details: ${String(error)}` : '';
      console.error(this.formatMessage(LogLevel.ERROR, message) + errorInfo);
    }
  }

  /**
   * 创建子日志器
   */
  child(prefix: string): Logger {
    return new Logger(
      this.level === LogLevel.DEBUG ? 'debug' : 
      this.level === LogLevel.INFO ? 'info' : 
      this.level === LogLevel.WARN ? 'warn' : 'error',
      this.prefix ? `${this.prefix}:${prefix}` : prefix
    );
  }
}

/**
 * 全局日志实例
 */
export const globalLogger = new Logger('info', 'app');
