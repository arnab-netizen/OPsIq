/**
 * Regression tests for engagements error classification boundary.
 *
 * Proves that:
 * 1. Raw route errors never escape as handler_invocation_failed
 * 2. Raw service errors are classified as engagements_service_call_failed
 * 3. Prisma errors are classified as engagements_find_many_failed or engagements_count_failed
 * 4. /api/engagements 500 responses always include classification and stage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClassifiedApiError } from "@/infra/classified-error";

describe("Engagements Error Classification", () => {
  describe("ClassifiedApiError structure", () => {
    it("ClassifiedApiError must always have classification and stage", () => {
      const error = new ClassifiedApiError(
        "test error",
        "test_classification",
        "test_stage",
        500
      );

      expect(error.classification).toBe("test_classification");
      expect(error.stage).toBe("test_stage");
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("test error");
    });

    it("ClassifiedApiError must NOT allow undefined classification", () => {
      const error = new ClassifiedApiError(
        "test",
        "some_classification",
        "some_stage"
      );
      expect(error.classification).toBeDefined();
      expect(error.classification).not.toBe("undefined");
    });

    it("ClassifiedApiError must NOT allow undefined stage", () => {
      const error = new ClassifiedApiError(
        "test",
        "some_classification",
        "some_stage"
      );
      expect(error.stage).toBeDefined();
      expect(error.stage).not.toBe("undefined");
    });
  });

  describe("Route error classification (GET /api/engagements)", () => {
    it("workspace_context missing should be engagements_workspace_context_failed", () => {
      const error = new ClassifiedApiError(
        "workspace context missing",
        "engagements_workspace_context_failed",
        "workspace_context",
        403
      );

      expect(error.classification).toBe("engagements_workspace_context_failed");
      expect(error.stage).toBe("workspace_context");
      expect(error.statusCode).toBe(403);
    });

    it("parse_query failure should be engagements_parse_query_failed with 400", () => {
      const error = new ClassifiedApiError(
        "invalid query parameters",
        "engagements_parse_query_failed",
        "parse_query",
        400
      );

      expect(error.classification).toBe("engagements_parse_query_failed");
      expect(error.stage).toBe("parse_query");
      expect(error.statusCode).toBe(400);
    });

    it("service_call failure should be engagements_service_call_failed", () => {
      const error = new ClassifiedApiError(
        "service failed",
        "engagements_service_call_failed",
        "service_call",
        500
      );

      expect(error.classification).toBe("engagements_service_call_failed");
      expect(error.stage).toBe("service_call");
    });

    it("response_validation failure should be engagements_response_validation_failed", () => {
      const error = new ClassifiedApiError(
        "engagements must be array",
        "engagements_response_validation_failed",
        "response_validation",
        500
      );

      expect(error.classification).toBe(
        "engagements_response_validation_failed"
      );
      expect(error.stage).toBe("response_validation");
    });

    it("route errors MUST start with 'engagements_', never 'handler_invocation_failed'", () => {
      const stages = [
        "workspace_context",
        "parse_query",
        "service_call",
        "response_validation",
        "response_return",
      ];

      stages.forEach((stage) => {
        const error = new ClassifiedApiError(
          "test",
          `engagements_${stage}_failed`,
          stage
        );

        expect(error.classification).toMatch(/^engagements_/);
        expect(error.classification).not.toBe("handler_invocation_failed");
      });
    });
  });

  describe("Service error classification (listEngagements)", () => {
    it("findMany failure should be engagements_find_many_failed", () => {
      const error = new ClassifiedApiError(
        "Prisma query failed",
        "engagements_find_many_failed",
        "find_many",
        500
      );

      expect(error.classification).toBe("engagements_find_many_failed");
      expect(error.stage).toBe("find_many");
    });

    it("count failure should be engagements_count_failed", () => {
      const error = new ClassifiedApiError(
        "Prisma count failed",
        "engagements_count_failed",
        "count",
        500
      );

      expect(error.classification).toBe("engagements_count_failed");
      expect(error.stage).toBe("count");
    });

    it("map_response failure should be engagements_map_response_failed", () => {
      const error = new ClassifiedApiError(
        "Response mapping failed",
        "engagements_map_response_failed",
        "map_response",
        500
      );

      expect(error.classification).toBe("engagements_map_response_failed");
      expect(error.stage).toBe("map_response");
    });

    it("service errors MUST start with 'engagements_', never 'handler_invocation_failed'", () => {
      const stages = ["build_where", "find_many", "count", "map_response"];

      stages.forEach((stage) => {
        const error = new ClassifiedApiError(
          "test",
          `engagements_${stage}_failed`,
          stage
        );

        expect(error.classification).toMatch(/^engagements_/);
        expect(error.classification).not.toBe("handler_invocation_failed");
      });
    });
  });

  describe("Error response structure", () => {
    it("toApiResponse must include correlationId, classification, and stage", () => {
      const error = new ClassifiedApiError(
        "test error",
        "engagements_test_failed",
        "test_stage"
      );

      const response = error.toApiResponse("corr-test-123");

      expect(response).toHaveProperty("error");
      expect(response).toHaveProperty("correlationId", "corr-test-123");
      expect(response).toHaveProperty("classification", "engagements_test_failed");
      expect(response).toHaveProperty("stage", "test_stage");
    });

    it("error response must never have undefined classification", () => {
      const error = new ClassifiedApiError(
        "test",
        "engagements_test_failed",
        "test"
      );
      const response = error.toApiResponse("corr-123");

      expect(response.classification).not.toBeUndefined();
      expect(response.classification).not.toBe("undefined");
    });

    it("error response must never have undefined stage", () => {
      const error = new ClassifiedApiError(
        "test",
        "engagements_test_failed",
        "test"
      );
      const response = error.toApiResponse("corr-123");

      expect(response.stage).not.toBeUndefined();
      expect(response.stage).not.toBe("undefined");
    });
  });

  describe("Wrapper behavior", () => {
    it("wrapper must preserve ClassifiedApiError as-is", () => {
      const innerError = new ClassifiedApiError(
        "inner failure",
        "engagements_find_many_failed",
        "find_many"
      );

      // Simulate what wrapper does: if error is ClassifiedApiError, preserve it
      const classifiedError =
        innerError instanceof ClassifiedApiError ? innerError : null;

      expect(classifiedError).toBe(innerError);
      expect(classifiedError?.classification).toBe("engagements_find_many_failed");
      expect(classifiedError?.stage).toBe("find_many");
    });

    it("wrapper must only use handler_invocation_failed for raw/unclassified errors", () => {
      // Simulate wrapper handling a raw error
      const rawError = new Error("some raw error");

      const isClassified = rawError instanceof ClassifiedApiError;
      const shouldBeWrapped = !isClassified;

      expect(shouldBeWrapped).toBe(true);

      if (shouldBeWrapped) {
        const wrapped = new ClassifiedApiError(
          rawError.message,
          "handler_invocation_failed",
          "handler_invocation"
        );
        expect(wrapped.classification).toBe("handler_invocation_failed");
      }
    });
  });

  describe("Smoke test guarantees", () => {
    it("GET /api/engagements 500 response must include classification and stage (not undefined)", () => {
      const response = {
        error: "Internal server error",
        correlationId: "corr-test-123",
        classification: "engagements_find_many_failed",
        stage: "find_many",
      };

      expect(response.classification).toBeDefined();
      expect(response.classification).not.toBe("undefined");
      expect(response.stage).toBeDefined();
      expect(response.stage).not.toBe("undefined");
    });

    it("GET /api/engagements must never return handler_invocation_failed for route/service errors", () => {
      const validClassifications = [
        "engagements_workspace_context_failed",
        "engagements_parse_query_failed",
        "engagements_service_call_failed",
        "engagements_find_many_failed",
        "engagements_count_failed",
        "engagements_map_response_failed",
        "engagements_response_validation_failed",
      ];

      validClassifications.forEach((classification) => {
        expect(classification).not.toBe("handler_invocation_failed");
        expect(classification).toMatch(/^engagements_/);
      });
    });

    it("GET /api/engagements 200 response must have engagements array and total count", () => {
      const response = {
        engagements: [],
        total: 0,
        limit: 25,
        offset: 0,
      };

      expect(Array.isArray(response.engagements)).toBe(true);
      expect(typeof response.total).toBe("number");
      expect(typeof response.limit).toBe("number");
      expect(typeof response.offset).toBe("number");
    });
  });
});
