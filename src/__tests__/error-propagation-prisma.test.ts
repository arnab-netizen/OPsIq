/**
 * Tests for Prisma error propagation chain
 *
 * Verifies that Prisma errors are safely extracted, classified,
 * and propagated to client responses without exposing secrets.
 */

import { describe, it, expect } from "vitest";
import {
  ClassifiedApiError,
  extractSafePrismaError,
  hasClassification,
  ensureClassification,
} from "@/infra/classified-error";

describe("Error Propagation: Prisma Details", () => {
  describe("extractSafePrismaError", () => {
    it("extracts prismaCode from PrismaClientKnownRequestError", () => {
      const mockPrismaError = {
        name: "PrismaClientKnownRequestError",
        code: "P2022",
        message: "Unknown field `nonExistentField` in the model `Engagement`.",
        clientVersion: "5.0.0",
      };

      const safe = extractSafePrismaError(mockPrismaError);

      expect(safe.prismaCode).toBe("P2022");
      expect(safe.safeMessage).toContain("Unknown field");
      expect((safe as any).clientVersion).toBeUndefined();
    });

    it("sanitizes query details from Prisma error message", () => {
      const mockPrismaError = {
        code: "P2022",
        message: "Unknown field `secretPassword` in the model `User`. Available fields: id, email",
      };

      const safe = extractSafePrismaError(mockPrismaError);

      // Should sanitize field name
      expect(safe.safeMessage).not.toContain("secretPassword");
      expect(safe.safeMessage).toContain("Unknown field");
    });

    it("returns safe details for non-Prisma errors", () => {
      const genericError = new Error("Something went wrong");
      const safe = extractSafePrismaError(genericError);

      expect(safe.errorName).toBe("Error");
      expect(safe.safeMessage).toBe("Something went wrong");
      expect(safe.prismaCode).toBeUndefined();
    });
  });

  describe("ClassifiedApiError safeDetails", () => {
    it("preserves safeDetails property", () => {
      const error = new ClassifiedApiError(
        "Test error",
        "test_classification",
        "test_stage"
      );

      error.safeDetails = {
        prismaCode: "P2025",
        safeMessage: "Record not found",
        failingOperation: "findUnique",
        engagementsServiceVersion: "v1",
      };

      expect(error.safeDetails).toEqual({
        prismaCode: "P2025",
        safeMessage: "Record not found",
        failingOperation: "findUnique",
        engagementsServiceVersion: "v1",
      });
    });

    it("has undefined safeDetails by default", () => {
      const error = new ClassifiedApiError(
        "Test error",
        "test_classification",
        "test_stage"
      );

      expect(error.safeDetails).toBeUndefined();
    });
  });

  describe("hasClassification", () => {
    it("detects ClassifiedApiError with classification and stage", () => {
      const error = new ClassifiedApiError(
        "Test error",
        "test_classification",
        "test_stage"
      );

      expect(hasClassification(error)).toBe(true);
    });

    it("rejects errors without classification", () => {
      const error = new Error("Generic error");

      expect(hasClassification(error)).toBe(false);
    });

    it("rejects undefined classification string", () => {
      const error = {
        classification: "undefined",
        stage: "test_stage",
      };

      expect(hasClassification(error)).toBe(false);
    });
  });

  describe("ensureClassification", () => {
    it("preserves safeDetails for instanceof ClassifiedApiError", () => {
      const error = new ClassifiedApiError(
        "Test error",
        "test_classification",
        "test_stage"
      );
      error.safeDetails = {
        prismaCode: "P2022",
        failingOperation: "engagement.findMany",
      };

      const ensured = ensureClassification(error);

      expect(ensured.safeDetails).toEqual({
        prismaCode: "P2022",
        failingOperation: "engagement.findMany",
      });
    });

    it("copies safeDetails for structural classification", () => {
      const error = {
        message: "Test error",
        classification: "test_classification",
        stage: "test_stage",
        statusCode: 500,
        safeDetails: {
          prismaCode: "P2025",
          safeMessage: "Not found",
        },
      };

      const ensured = ensureClassification(error);

      expect(ensured.safeDetails).toEqual({
        prismaCode: "P2025",
        safeMessage: "Not found",
      });
    });

    it("creates default ClassifiedApiError for unclassified errors", () => {
      const error = new Error("Generic error");

      const ensured = ensureClassification(error);

      expect(ensured.classification).toBe("unclassified_internal_error");
      expect(ensured.stage).toBe("unclassified_error_boundary");
      expect(ensured.safeDetails).toBeUndefined();
    });
  });

  describe("Engagement service version marker", () => {
    it("ClassifiedApiError can include engagementsServiceVersion in safeDetails", () => {
      const error = new ClassifiedApiError(
        "engagement.findMany failed",
        "engagements_find_many_failed",
        "find_many",
        500
      );

      error.safeDetails = {
        prismaCode: "P2022",
        failingOperation: "engagement.findMany",
        engagementsServiceVersion: "engagements-service-prisma-debug-v1",
      };

      expect(error.safeDetails?.engagementsServiceVersion).toBe(
        "engagements-service-prisma-debug-v1"
      );
    });
  });
});
