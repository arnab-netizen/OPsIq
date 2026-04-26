type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogPayload {
  message: string;
  requestId?: string;
  correlationId?: string;
  event?: string;
  data?: Record<string, unknown>;
  error?: unknown;
}

function serializeError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { value: String(error) };
}

function write(level: LogLevel, payload: LogPayload): void {
  const record = {
    level,
    ts: new Date().toISOString(),
    message: payload.message,
    requestId: payload.requestId,
    correlationId: payload.correlationId,
    event: payload.event,
    data: payload.data,
    error: serializeError(payload.error),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (payload: LogPayload) => write("debug", payload),
  info: (payload: LogPayload) => write("info", payload),
  warn: (payload: LogPayload) => write("warn", payload),
  error: (payload: LogPayload) => write("error", payload),
};
