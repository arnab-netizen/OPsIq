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
 * If error is ClassifiedApiError, preserve it.
 * Otherwise, create a default classification.
 */
export function ensureClassification(
  error: unknown,
  defaultStage: string = "unclassified_error_boundary",
  defaultClassification: string = "unclassified_internal_error"
): ClassifiedApiError {
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
