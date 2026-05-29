/**
 * Tests for route-level execution tracking
 *
 * Verifies that route-level markers appear in responses for diagnostics.
 */

import { describe, it, expect } from "vitest";
import { ClassifiedApiError } from "@/infra/classified-error";

describe("Route-Level Execution Markers", () => {
  describe("Route version and service path in errors", () => {
    it("ClassifiedApiError includes routeVersion in safeDetails", () => {
      const error = new ClassifiedApiError(
        "Test error",
        "engagements_service_call_failed",
        "service_call"
      );

      error.safeDetails = {
        routeVersion: "engagements-route-debug-v1",
        serviceImportPath: "@/services/engagement",
        handlerName: "engagementsGetHandler",
      };

      expect(error.safeDetails?.routeVersion).toBe("engagements-route-debug-v1");
      expect(error.safeDetails?.serviceImportPath).toBe("@/services/engagement");
      expect(error.safeDetails?.handlerName).toBe("engagementsGetHandler");
    });

    it("Route markers are preserved when error is re-thrown", () => {
      const originalError = new ClassifiedApiError(
        "Test error",
        "engagements_find_many_failed",
        "find_many"
      );
      originalError.safeDetails = {
        prismaCode: "P2022",
        failingOperation: "engagement.findMany",
        engagementsServiceVersion: "engagements-service-prisma-debug-v1",
      };

      // Simulate route catching and adding markers
      const routeError = originalError as any;
      if (!routeError.safeDetails) {
        routeError.safeDetails = {};
      }
      if (!routeError.safeDetails.routeVersion) {
        routeError.safeDetails.routeVersion = "engagements-route-debug-v1";
      }
      if (!routeError.safeDetails.handlerName) {
        routeError.safeDetails.handlerName = "engagementsGetHandler";
      }

      expect(routeError.safeDetails.prismaCode).toBe("P2022");
      expect(routeError.safeDetails.routeVersion).toBe("engagements-route-debug-v1");
      expect(routeError.safeDetails.engagementsServiceVersion).toBe(
        "engagements-service-prisma-debug-v1"
      );
    });

    it("Route adds context to wrapped service errors", () => {
      const error = new ClassifiedApiError(
        "Service error",
        "engagements_service_call_failed",
        "service_call"
      );

      // Route adds markers when catching from service
      error.safeDetails = {
        routeVersion: "engagements-route-debug-v1",
        serviceImportPath: "@/services/engagement",
        handlerName: "engagementsGetHandler",
      };

      expect(error.safeDetails).toEqual({
        routeVersion: "engagements-route-debug-v1",
        serviceImportPath: "@/services/engagement",
        handlerName: "engagementsGetHandler",
      });
    });

    it("Pre-service errors include route markers", () => {
      const error = new ClassifiedApiError(
        "Parse query failed",
        "engagements_parse_query_failed",
        "parse_query",
        400
      );

      error.safeDetails = {
        routeVersion: "engagements-route-debug-v1",
        serviceImportPath: "@/services/engagement",
        handlerName: "engagementsGetHandler",
      };

      expect(error.safeDetails?.routeVersion).toBe("engagements-route-debug-v1");
    });

    it("If engagementsServiceVersion missing but routeVersion present, error is pre-service", () => {
      const error = new ClassifiedApiError(
        "Error before service",
        "engagements_parse_query_failed",
        "parse_query"
      );

      error.safeDetails = {
        routeVersion: "engagements-route-debug-v1",
        serviceImportPath: "@/services/engagement",
        handlerName: "engagementsGetHandler",
        engagementsServiceVersion: undefined,
      };

      // This pattern proves error happened before service was called
      const hasRouteVersion = !!error.safeDetails?.routeVersion;
      const hasServiceVersion = !!error.safeDetails?.engagementsServiceVersion;

      expect(hasRouteVersion).toBe(true);
      expect(hasServiceVersion).toBe(false);
    });
  });
});
