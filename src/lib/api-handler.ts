import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@/infra/logger";
import { errorToResponse, AppError, toAppError } from "@/infra/errors";

export type ApiHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;

export function withRequestContext(handler: ApiHandler): ApiHandler {
  return async (request, context) => {
    const correlationId =
      request.headers.get("x-correlation-id") ?? uuidv4();
    const requestId = uuidv4();
    const log = createLogger(correlationId, requestId);

    const start = Date.now();
    const url = new URL(request.url);

    log.info("API request started", {
      method: request.method,
      path: url.pathname,
    });

    try {
      const response = await handler(request, context);

      log.info("API request completed", {
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Date.now() - start,
      });

      response.headers.set("x-correlation-id", correlationId);
      response.headers.set("x-request-id", requestId);

      return response;
    } catch (error) {
      const appError = toAppError(error, correlationId);

      log.error("API request failed", {
        method: request.method,
        path: url.pathname,
        status: appError.statusCode,
        error: appError.message,
        code: appError.code,
        durationMs: Date.now() - start,
      });

      const response = errorToResponse(appError, correlationId);
      response.headers.set("x-correlation-id", correlationId);
      response.headers.set("x-request-id", requestId);

      return response;
    }
  };
}
