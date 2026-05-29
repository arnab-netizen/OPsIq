/**
 * Classified API Error
 *
 * All API errors must carry classification and stage so failures are immediately
 * actionable without requiring log access.
 */

export interface ApiErrorResponse {
  error: string;
  correlationId: string;
  classification: string;
  stage: string;
}

export class ClassifiedApiError extends Error {
  public readonly classification: string;
  public readonly stage: string;
  public readonly statusCode: number;
  public readonly cause?: unknown;

  constructor(
    message: string,
    classification: string,
    stage: string,
    statusCode: number = 500,
    cause?: unknown
  ) {
    super(message);
    this.name = "ClassifiedApiError";
    this.classification = classification;
    this.stage = stage;
    this.statusCode = statusCode;
    this.cause = cause;
  }

  toApiResponse(correlationId: string): ApiErrorResponse {
    return {
      error: this.message,
      correlationId,
      classification: this.classification,
      stage: this.stage,
    };
  }
}

/**
 * Ensure an error always has classification/stage.
 * If error has structure (classification + stage), preserve it.
 * Otherwise, create a default classification.
 */
export function hasClassification(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const obj = error as any;
  return (
    typeof obj.classification === "string" &&
    obj.classification.length > 0 &&
    obj.classification !== "undefined" &&
    typeof obj.stage === "string" &&
    obj.stage.length > 0 &&
    obj.stage !== "undefined"
  );
}

export function ensureClassification(
  error: unknown,
  defaultStage: string = "unclassified_error_boundary",
  defaultClassification: string = "unclassified_internal_error"
): ClassifiedApiError {
  // Check structural classification first (works across module boundaries)
  if (hasClassification(error)) {
    const obj = error as any;
    const statusCode = typeof obj.statusCode === "number" ? obj.statusCode : 500;
    const apiError = new ClassifiedApiError(
      obj.message || String(error),
      obj.classification,
      obj.stage,
      statusCode,
      error
    );
    return apiError;
  }

  // Fallback: instanceof check
  if (error instanceof ClassifiedApiError) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : String(error);
  return new ClassifiedApiError(
    message,
    defaultClassification,
    defaultStage,
    500,
    error
  );
}
