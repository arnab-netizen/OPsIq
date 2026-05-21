import { classifyOperatorError } from "@/lib/operator-error-governance";

export interface LogEvent {
  type: string;
  workspaceId: string;
  durationMs?: number;
  status: 'ok' | 'error';
  error?: string;
  metadata?: Record<string, unknown>;
}

export function logEvent(event: LogEvent): void {
  console.log(JSON.stringify(event));
}

export function createEventLogger(type: string, workspaceId: string) {
  const startTime = Date.now();

  return {
    success: (metadata?: Record<string, unknown>) => {
      const durationMs = Date.now() - startTime;
      logEvent({
        type,
        workspaceId,
        durationMs,
        status: 'ok',
        metadata,
      });
    },
    error: (error: Error | string, metadata?: Record<string, unknown>) => {
      const durationMs = Date.now() - startTime;
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logEvent({
        type,
        workspaceId,
        durationMs,
        status: 'error',
        error: governed.operatorMessage,
        metadata,
      });
    },
  };
}
