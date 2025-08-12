/**
 * Enhanced logging utility with structured logging and file rotation
 */

import {
  createWriteStream,
  WriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

/**
 * Enhanced logger with structured logging and file rotation
 */
export class Logger {
  private logStream: WriteStream | null = null;
  private currentLogFile: string;
  private logLevel: LogLevel;
  private maxLogSize: number;

  constructor(
    private logDir: string,
    level: string = "info",
    maxLogSize: number = 100 * 1024 * 1024
  ) {
    this.logLevel = this.parseLogLevel(level);
    this.maxLogSize = maxLogSize;
    this.currentLogFile = join(logDir, "server.log");
    this.ensureLogDirectory();
    this.initializeLogStream();
  }

  /**
   * Parse log level from string
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case "error":
        return LogLevel.ERROR;
      case "warn":
        return LogLevel.WARN;
      case "info":
        return LogLevel.INFO;
      case "debug":
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Initialize log stream with rotation check
   */
  private initializeLogStream(): void {
    this.checkLogRotation();
    this.logStream = createWriteStream(this.currentLogFile, { flags: "a" });
  }

  /**
   * Check if log rotation is needed
   */
  private checkLogRotation(): void {
    if (existsSync(this.currentLogFile)) {
      const stats = statSync(this.currentLogFile);
      if (stats.size > this.maxLogSize) {
        this.rotateLog();
      }
    }
  }

  /**
   * Rotate log file
   */
  private rotateLog(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotatedFile = join(this.logDir, `server-${timestamp}.log`);

    try {
      // Close current stream
      if (this.logStream) {
        this.logStream.end();
      }

      // Rename current log file
      const fs = require("fs");
      fs.renameSync(this.currentLogFile, rotatedFile);
    } catch (error) {
      console.error("Failed to rotate log file:", error);
    }
  }

  /**
   * Format log entry
   */
  private formatLogEntry(
    level: string,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...(context && { context }),
      ...(error && {
        error: { name: error.name, message: error.message, stack: error.stack },
      }),
    };

    return JSON.stringify(entry) + "\n";
  }

  /**
   * Write log entry
   */
  private writeLog(
    level: LogLevel,
    levelName: string,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): void {
    if (level > this.logLevel) {
      return;
    }

    const formattedEntry = this.formatLogEntry(
      levelName,
      message,
      context,
      error
    );

    // Write to file
    if (this.logStream) {
      this.checkLogRotation();
      this.logStream.write(formattedEntry);
    }

    // Also write to console in development
    if (process.env.NODE_ENV !== "production") {
      const consoleMessage = `[${new Date().toISOString()}] ${levelName.toUpperCase()}: ${message}`;

      switch (level) {
        case LogLevel.ERROR:
          console.error(consoleMessage, context, error);
          break;
        case LogLevel.WARN:
          console.warn(consoleMessage, context);
          break;
        case LogLevel.INFO:
          console.info(consoleMessage, context);
          break;
        case LogLevel.DEBUG:
          console.debug(consoleMessage, context);
          break;
      }
    }
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, any>, error?: Error): void {
    this.writeLog(LogLevel.ERROR, "error", message, context, error);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.WARN, "warn", message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.INFO, "info", message, context);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.DEBUG, "debug", message, context);
  }

  /**
   * Close logger and cleanup resources
   */
  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

/**
 * Create logger instance
 */
export function createLogger(
  logDir?: string,
  level?: string,
  maxLogSize?: number
): Logger {
  const defaultLogDir = join(
    fileURLToPath(import.meta.url),
    "..",
    "..",
    "..",
    "logs"
  );
  return new Logger(logDir || defaultLogDir, level, maxLogSize);
}
