/**
 * Request Validation Middleware
 *
 * Provides centralized request validation for all API endpoints.
 * Validates request body, query parameters, and headers using Zod schemas.
 * Returns structured error responses for validation failures.
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  headers?: ZodSchema;
  params?: ZodSchema;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validate request data against Zod schemas
 */
export async function validateRequest(
  request: NextRequest,
  schemas: ValidationSchemas
): Promise<{ valid: true; data: any } | { valid: false; errors: ValidationError[] }> {
  const errors: ValidationError[] = [];

  // Validate body if schema provided
  if (schemas.body) {
    try {
      const body = await request.json();
      await schemas.body.parseAsync(body);
    } catch (error) {
      if (error instanceof ZodError) {
        errors.push(
          ...error.issues.map((err) => ({
            field: err.path.join("."),
            message: err.message,
            code: err.code,
          }))
        );
      }
    }
  }

  // Validate query parameters if schema provided
  if (schemas.query) {
    try {
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams);
      await schemas.query.parseAsync(queryParams);
    } catch (error) {
      if (error instanceof ZodError) {
        errors.push(
          ...error.issues.map((err) => ({
            field: `query.${err.path.join(".")}`,
            message: err.message,
            code: err.code,
          }))
        );
      }
    }
  }

  // Validate headers if schema provided
  if (schemas.headers) {
    try {
      const headersObj = Object.fromEntries(request.headers);
      await schemas.headers.parseAsync(headersObj);
    } catch (error) {
      if (error instanceof ZodError) {
        errors.push(
          ...error.issues.map((err) => ({
            field: `header.${err.path.join(".")}`,
            message: err.message,
            code: err.code,
          }))
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: {} };
}

/**
 * Middleware wrapper for request validation
 */
export function withRequestValidation(
  handler: (request: NextRequest) => Promise<NextResponse>,
  schemas: ValidationSchemas
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = await validateRequest(request, schemas);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Request validation failed",
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    return handler(request);
  };
}

/**
 * Error response formatter for validation errors
 */
export function formatValidationErrors(zodError: ZodError): {
  message: string;
  errors: ValidationError[];
  code: string;
} {
  return {
    message: "Request validation failed",
    errors: zodError.issues.map((err) => ({
      field: err.path.join("."),
      message: err.message,
      code: err.code,
    })),
    code: "VALIDATION_ERROR",
  };
}

/**
 * Extract and validate body with proper error handling
 */
export async function parseRequestBody<T>(
  request: NextRequest,
  schema: ZodSchema
): Promise<{ success: true; data: T } | { success: false; error: ValidationError[] }> {
  try {
    const body = await request.json();
    const data = await schema.parseAsync(body);
    return { success: true, data: data as T };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        })),
      };
    }
    return {
      success: false,
      error: [{ field: "body", message: "Invalid request body", code: "PARSE_ERROR" }],
    };
  }
}

/**
 * Extract and validate query parameters
 */
export function parseQueryParams<T>(
  request: NextRequest,
  schema: ZodSchema
): { success: true; data: T } | { success: false; error: ValidationError[] } {
  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const data = schema.parse(queryParams);
    return { success: true, data: data as T };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues.map((err) => ({
          field: `query.${err.path.join(".")}`,
          message: err.message,
          code: err.code,
        })),
      };
    }
    return {
      success: false,
      error: [{ field: "query", message: "Invalid query parameters", code: "PARSE_ERROR" }],
    };
  }
}

/**
 * Extract and validate headers
 */
export function parseHeaders<T>(
  request: NextRequest,
  schema: ZodSchema
): { success: true; data: T } | { success: false; error: ValidationError[] } {
  try {
    const headersObj = Object.fromEntries(request.headers);
    const data = schema.parse(headersObj);
    return { success: true, data: data as T };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: error.issues.map((err) => ({
          field: `header.${err.path.join(".")}`,
          message: err.message,
          code: err.code,
        })),
      };
    }
    return {
      success: false,
      error: [{ field: "headers", message: "Invalid headers", code: "PARSE_ERROR" }],
    };
  }
}
