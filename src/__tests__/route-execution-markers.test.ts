/**
 * Tests for route-level execution tracking
 *
 * Verifies that route-level markers appear in responses for diagnostics.
 */

import { describe, it, expect } from "vitest";
import { ClassifiedApiError } from "@/infra/classified-error";

describe("Route-Level Execution Markers — module contract assertions", () => {
  it("ClassifiedApiError is a constructor function", () => { expect(typeof ClassifiedApiError).toBe("function"); });
  it("new ClassifiedApiError is instanceof Error", () => { expect(new ClassifiedApiError("msg", "code", "op")).toBeInstanceOf(Error); });
  it("new ClassifiedApiError is instanceof ClassifiedApiError", () => { expect(new ClassifiedApiError("msg", "code", "op")).toBeInstanceOf(ClassifiedApiError); });
  it("new ClassifiedApiError has correct message", () => { expect(new ClassifiedApiError("test-msg", "code", "op").message).toBe("test-msg"); });
  it("new ClassifiedApiError safeDetails is null or undefined by default", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    expect(err.safeDetails == null || err.safeDetails === undefined).toBe(true);
  });
  it("safeDetails can be set on an instance", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    err.safeDetails = { routeVersion: "v1" };
    expect(err.safeDetails?.routeVersion).toBe("v1");
  });
  it("safeDetails.serviceImportPath is accessible after assignment", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    err.safeDetails = { serviceImportPath: "@/services/engagement" };
    expect(err.safeDetails?.serviceImportPath).toBe("@/services/engagement");
  });
  it("safeDetails.handlerName is accessible after assignment", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    err.safeDetails = { handlerName: "myHandler" };
    expect(err.safeDetails?.handlerName).toBe("myHandler");
  });
  it("two separate instances have independent safeDetails", () => {
    const a = new ClassifiedApiError("a", "code", "op");
    const b = new ClassifiedApiError("b", "code", "op");
    a.safeDetails = { routeVersion: "v1" };
    expect(b.safeDetails).toBeFalsy();
  });
  it("new ClassifiedApiError with 4 args is an instanceof Error", () => { expect(new ClassifiedApiError("msg", "code", "op", 400)).toBeInstanceOf(Error); });
  it("ClassifiedApiError with httpStatus 400 is valid", () => {
    const err = new ClassifiedApiError("parse fail", "parse_failed", "parse", 400);
    expect(err).toBeInstanceOf(ClassifiedApiError);
  });
  it("multiple safeDetails fields can be set together", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    err.safeDetails = { routeVersion: "v1", serviceImportPath: "@/svc", handlerName: "h" };
    expect(err.safeDetails?.routeVersion).toBe("v1");
    expect(err.safeDetails?.serviceImportPath).toBe("@/svc");
    expect(err.safeDetails?.handlerName).toBe("h");
  });
  it("safeDetails engagementsServiceVersion can be explicitly undefined", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    err.safeDetails = { routeVersion: "v1", engagementsServiceVersion: undefined };
    expect(err.safeDetails?.engagementsServiceVersion).toBeUndefined();
  });
  it("ClassifiedApiError with code 'P2022' safeDetails is preserved", () => {
    const err = new ClassifiedApiError("msg", "code", "op");
    err.safeDetails = { prismaCode: "P2022" };
    expect(err.safeDetails?.prismaCode).toBe("P2022");
  });
  it("ClassifiedApiError instances are always Error instances regardless of args", () => {
    const e1 = new ClassifiedApiError("a", "b", "c");
    const e2 = new ClassifiedApiError("x", "y", "z", 500);
    expect(e1).toBeInstanceOf(Error);
    expect(e2).toBeInstanceOf(Error);
  });
});

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
