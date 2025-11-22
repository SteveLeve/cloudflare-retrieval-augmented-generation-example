/**
 * Structured logging utility for verbose debugging and monitoring
 *
 * Provides consistent, structured logging across the RAG application
 * with support for different log levels, context data, and performance tracking.
 */

import { LogLevel, LogEntry } from '../types';

export class Logger {
  private context: Record<string, unknown>;
  private startTimes: Map<string, number>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
    this.startTimes = new Map();
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Log a debug message (verbose details for development)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message (general informational messages)
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message (concerning but not critical)
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message (critical issues)
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Start a performance timer
   */
  startTimer(label: string): void {
    this.startTimes.set(label, Date.now());
    this.debug(`Timer started: ${label}`);
  }

  /**
   * End a performance timer and log the duration
   */
  endTimer(label: string, context?: Record<string, unknown>): number {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      this.warn(`Timer "${label}" was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.startTimes.delete(label);

    this.info(`Timer ended: ${label}`, {
      ...context,
      durationMs: duration,
    });

    return duration;
  }

  /**
   * Log with structured data
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      context: { ...this.context, ...context },
    };

    if (error) {
      entry.error = error;
      entry.context = {
        ...entry.context,
        errorMessage: error.message,
        errorStack: error.stack,
      };
    }

    // Format for console output
    const formatted = this.formatLogEntry(entry);

    // Route to appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  /**
   * Format log entry for console output
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const contextStr = Object.keys(entry.context || {}).length > 0
      ? ` ${JSON.stringify(entry.context)}`
      : '';

    return `[${timestamp}] ${entry.level}: ${entry.message}${contextStr}`;
  }

  /**
   * Wrap an async function with logging and error handling
   */
  static async withLogging<T>(
    logger: Logger,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    logger.startTimer(operation);
    logger.info(`Starting: ${operation}`);

    try {
      const result = await fn();
      logger.endTimer(operation, { success: true });
      return result;
    } catch (error) {
      logger.endTimer(operation, { success: false });
      logger.error(
        `Failed: ${operation}`,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * Create a root logger for the application
 */
export function createLogger(context?: Record<string, unknown>): Logger {
  return new Logger(context);
}
