export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  correlationId?: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const level = process.env.LOG_LEVEL as LogLevel | undefined;
  return level && LOG_LEVEL_PRIORITY[level] !== undefined ? level : "info";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getConfiguredLevel()];
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function emit(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  correlationId?: string,
  requestId?: string
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(correlationId && { correlationId }),
    ...(requestId && { requestId }),
    ...(context && Object.keys(context).length > 0 && { context }),
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(childContext: { correlationId?: string; requestId?: string }): Logger;
}

export function createLogger(
  correlationId?: string,
  requestId?: string
): Logger {
  return {
    debug: (msg, ctx) => emit("debug", msg, ctx, correlationId, requestId),
    info: (msg, ctx) => emit("info", msg, ctx, correlationId, requestId),
    warn: (msg, ctx) => emit("warn", msg, ctx, correlationId, requestId),
    error: (msg, ctx) => emit("error", msg, ctx, correlationId, requestId),
    child: (childCtx) =>
      createLogger(
        childCtx.correlationId ?? correlationId,
        childCtx.requestId ?? requestId
      ),
  };
}

export const logger = createLogger();
