/**
 * Structured Logging Service
 *
 * Provides structured logging with context tracking, multiple log levels,
 * and flexible output formats. Mock-backed for non-DB environments.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

export interface LogContext {
  requestId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: LogContext;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  minLevel: LogLevel;
  format: "json" | "text";
  includeTimestamp: boolean;
  includeContext: boolean;
  maxBufferSize: number;
  flushIntervalMs: number;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

export const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: LogLevel.INFO,
  format: "json",
  includeTimestamp: true,
  includeContext: true,
  maxBufferSize: 1000,
  flushIntervalMs: 5000,
};

// Global context
let globalContext: LogContext = {};
let logBuffer: LogEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Set global logging context
 */
export function setGlobalContext(context: LogContext): void {
  globalContext = { ...globalContext, ...context };
}

/**
 * Clear global context
 */
export function clearGlobalContext(): void {
  globalContext = {};
}

/**
 * Update global context (merge with existing)
 */
export function updateGlobalContext(context: Partial<LogContext>): void {
  globalContext = { ...globalContext, ...context };
}

/**
 * Get current global context
 */
export function getGlobalContext(): LogContext {
  return { ...globalContext };
}

/**
 * Format log entry based on configuration
 */
function formatLogEntry(entry: LogEntry, config: LoggerConfig): string {
  if (config.format === "json") {
    const output: Record<string, unknown> = {
      level: entry.level,
      message: entry.message,
    };

    if (config.includeTimestamp) {
      output.timestamp = entry.timestamp.toISOString();
    }

    if (config.includeContext && Object.keys(entry.context).length > 0) {
      output.context = entry.context;
    }

    if (entry.metadata) {
      output.metadata = entry.metadata;
    }

    if (entry.error) {
      output.error = entry.error;
    }

    return JSON.stringify(output);
  } else {
    // Text format
    let output = `[${entry.level}]`;

    if (config.includeTimestamp) {
      output += ` ${entry.timestamp.toISOString()}`;
    }

    output += ` ${entry.message}`;

    if (config.includeContext && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ");
      output += ` {${contextStr}}`;
    }

    if (entry.error) {
      output += ` ERROR: ${entry.error.name}: ${entry.error.message}`;
    }

    if (entry.metadata) {
      output += ` ${JSON.stringify(entry.metadata)}`;
    }

    return output;
  }
}

/**
 * Write log entry to output
 */
function writeLog(entry: LogEntry, config: LoggerConfig): void {
  const formatted = formatLogEntry(entry, config);

  // In-memory environment: use console
  if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
    console.error(formatted);
  } else if (entry.level === LogLevel.WARN) {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

/**
 * Log entry with specified level
 */
function log(
  level: LogLevel,
  message: string,
  context: LogContext = {},
  metadata?: Record<string, unknown>,
  error?: Error,
  config: LoggerConfig = DEFAULT_CONFIG
): void {
  // Check log level
  if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[config.minLevel]) {
    return;
  }

  const governedError = error ? classifyOperatorError(error, { context: "load" }) : null;
  // Extract original message from technicalDetails for internal logging
  let errorMessage = "Unknown error";
  if (governedError && governedError.technicalDetails) {
    try {
      const details = JSON.parse(governedError.technicalDetails);
      errorMessage = details.message || "Unknown error";
    } catch {
      // If technicalDetails is not JSON, use it as-is
      errorMessage = governedError.technicalDetails;
    }
  }
  const entry: LogEntry = {
    timestamp: new Date(),
    level,
    message,
    context: { ...globalContext, ...context },
    metadata,
    error: governedError
      ? {
          name: error instanceof Error ? error.name : "Unknown",
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        }
      : undefined,
  };

  // Add to buffer
  logBuffer.push(entry);

  // Flush if buffer full
  if (logBuffer.length >= config.maxBufferSize) {
    flushLogs(config);
  } else if (!flushTimer) {
    // Schedule flush
    flushTimer = setTimeout(() => {
      flushLogs(config);
    }, config.flushIntervalMs);
  }

  // Also write immediately for errors
  if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
    writeLog(entry, config);
  }
}

/**
 * Flush buffered logs
 */
export function flushLogs(config: LoggerConfig = DEFAULT_CONFIG): void {
  logBuffer.forEach((entry) => {
    writeLog(entry, config);
  });
  logBuffer = [];

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/**
 * Get current log buffer (for testing)
 */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

/**
 * Clear log buffer
 */
export function clearLogBuffer(): void {
  logBuffer = [];
}

/**
 * Main logger interface
 */
export const logger = {
  debug(
    message: string,
    context?: LogContext,
    metadata?: Record<string, unknown>,
    config?: LoggerConfig
  ): void {
    log(LogLevel.DEBUG, message, context, metadata, undefined, config);
  },

  info(
    message: string,
    context?: LogContext,
    metadata?: Record<string, unknown>,
    config?: LoggerConfig
  ): void {
    log(LogLevel.INFO, message, context, metadata, undefined, config);
  },

  warn(
    message: string,
    context?: LogContext,
    metadata?: Record<string, unknown>,
    config?: LoggerConfig
  ): void {
    log(LogLevel.WARN, message, context, metadata, undefined, config);
  },

  error(
    message: string,
    error?: Error | unknown,
    context?: LogContext,
    metadata?: Record<string, unknown>,
    config?: LoggerConfig
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));
    log(LogLevel.ERROR, message, context, metadata, err, config);
  },

  fatal(
    message: string,
    error?: Error | unknown,
    context?: LogContext,
    metadata?: Record<string, unknown>,
    config?: LoggerConfig
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));
    log(LogLevel.FATAL, message, context, metadata, err, config);
  },

  flush(config?: LoggerConfig): void {
    flushLogs(config);
  },

  setContext(context: LogContext): void {
    setGlobalContext(context);
  },

  updateContext(context: Partial<LogContext>): void {
    updateGlobalContext(context);
  },

  clearContext(): void {
    clearGlobalContext();
  },

  getContext(): LogContext {
    return getGlobalContext();
  },
};

/**
 * Logger interface for type compatibility
 */
export interface Logger {
  debug(message: string, context?: LogContext, metadata?: Record<string, unknown>): void;
  info(message: string, context?: LogContext, metadata?: Record<string, unknown>): void;
  warn(message: string, context?: LogContext, metadata?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, context?: LogContext, metadata?: Record<string, unknown>): void;
  fatal(message: string, error?: Error | unknown, context?: LogContext, metadata?: Record<string, unknown>): void;
}

/**
 * Create child logger with additional context
 * Supports both new (LogContext object) and legacy (correlationId, requestId strings) signatures
 */
export function createLogger(
  contextOrCorrelationId?: LogContext | string,
  requestId?: string
): Logger {
  // Support legacy signature: createLogger(correlationId, requestId)
  let defaultContext: LogContext = {};
  if (typeof contextOrCorrelationId === "string") {
    defaultContext = {
      correlationId: contextOrCorrelationId,
      ...(requestId && { requestId }),
    };
  } else if (typeof contextOrCorrelationId === "object" && contextOrCorrelationId !== null) {
    defaultContext = contextOrCorrelationId;
  }

  return {
    debug(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
      log(LogLevel.DEBUG, message, { ...defaultContext, ...context }, metadata);
    },
    info(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
      log(LogLevel.INFO, message, { ...defaultContext, ...context }, metadata);
    },
    warn(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
      log(LogLevel.WARN, message, { ...defaultContext, ...context }, metadata);
    },
    error(message: string, error?: Error | unknown, context?: LogContext, metadata?: Record<string, unknown>): void {
      const err = error instanceof Error ? error : new Error(String(error));
      log(LogLevel.ERROR, message, { ...defaultContext, ...context }, metadata, err);
    },
    fatal(message: string, error?: Error | unknown, context?: LogContext, metadata?: Record<string, unknown>): void {
      const err = error instanceof Error ? error : new Error(String(error));
      log(LogLevel.FATAL, message, { ...defaultContext, ...context }, metadata, err);
    },
  };
}
