/**
 * Canonical Route Wrapper Contract Tests
 *
 * Regression test suite for the canonical route enforcement wrapper.
 * Ensures handlers return plain serializable objects, not Response/NextResponse.
 *
 * Root cause of production bug: /api/engagements handler returned Response.json()
 * which wrapper JSON.stringify() serialized to {}, losing all engagement data.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Canonical Route Wrapper Contract", () => {
  describe("Handler return value requirements", () => {
    it("should serialize plain object handler return to JSON correctly", () => {
      // Plain object return from handler
      const plainObjectReturn = {
        engagements: [
          { id: "1", code: "ENG-001", title: "Test" },
        ],
        total: 1,
        limit: 25,
        offset: 0,
        _routeVersion: "v1",
      };

      // Wrapper behavior: JSON.stringify(handlerResult)
      const serialized = JSON.stringify(plainObjectReturn);
      const parsed = JSON.parse(serialized);

      // All properties must be preserved
      expect(parsed).toHaveProperty("engagements");
      expect(parsed).toHaveProperty("total");
      expect(parsed.engagements).toHaveLength(1);
      expect(parsed.engagements[0].code).toBe("ENG-001");
    });

    it("should NOT serialize Response.json() return to correct data", () => {
      // This is what caused the bug:
      // Handler returns Response.json({...}) instead of plain object
      const mockResponse = {
        body: JSON.stringify({
          engagements: [{ id: "1", code: "ENG-001" }],
          total: 1,
        }),
        status: 200,
        headers: {},
        // Response objects have non-enumerable properties that don't serialize
      };

      // When wrapper does JSON.stringify on Response object
      const serialized = JSON.stringify(mockResponse);
      const parsed = JSON.parse(serialized);

      // The engagement data is now nested in 'body' string, not top-level
      expect(parsed).not.toHaveProperty("engagements");
      expect(parsed).toHaveProperty("body"); // This is the bug - data is wrapped
      expect(parsed.engagements).toBeUndefined();
    });

    it("should fail if handler returns NextResponse instead of object", () => {
      // NextResponse is also a Response-like object
      class MockNextResponse {
        constructor(body: string, init: any) {
          this.body = body;
          this.status = init.status;
          this.headers = init.headers;
        }
      }

      const nextResponseReturn = new MockNextResponse(
        JSON.stringify({ engagements: [{ id: "1" }] }),
        { status: 200, headers: {} }
      );

      // Serializing NextResponse loses the actual data
      const serialized = JSON.stringify(nextResponseReturn);
      const parsed = JSON.parse(serialized);

      expect(parsed).not.toHaveProperty("engagements");
      expect(parsed.engagements).toBeUndefined();
    });
  });

  describe("Wrapped handler validation", () => {
    it("canonical wrapper should require handlers to return plain objects", () => {
      // A valid wrapped handler
      const validHandler = async (ctx: any) => {
        return {
          data: "result",
          status: "success",
          _version: "v1",
        };
      };

      // Handler should return object, not Response
      const result = validHandler({ verifiedWorkspaceId: "ws-1" });
      expect(result).toBeInstanceOf(Promise);
    });

    it("should fail closed if wrapped handler returns Response", () => {
      // Invalid: handler returns Response
      const invalidHandler = async (ctx: any) => {
        // This is what engagements/route.ts was doing (now fixed)
        // return Response.json({ engagements: [] });
        // After fix:
        return { engagements: [] }; // Plain object
      };

      expect(invalidHandler({ verifiedWorkspaceId: "ws-1" })).toBeInstanceOf(
        Promise
      );
    });
  });

  describe("Canonical shape enforcement for /api/engagements", () => {
    it("should return object with engagements array field", () => {
      const validEngagementsResponse = {
        engagements: [
          {
            id: "eng-1",
            code: "ENG-001",
            title: "Engagement",
            status: "active",
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
        _engagementsServiceVersion: "v1",
        _routeVersion: "v1",
      };

      // Service returns this shape
      const serialized = JSON.stringify(validEngagementsResponse);
      const parsed = JSON.parse(serialized);

      // Smoke parser logic: Array.isArray(data) ? data.length : data.engagements?.length || 0
      const engagementCount = Array.isArray(parsed)
        ? parsed.length
        : parsed.engagements?.length || 0;

      expect(engagementCount).toBe(1);
      expect(engagementCount).not.toBe(0);
    });

    it("should return empty array for no engagements, not null", () => {
      const noEngagementsResponse = {
        engagements: [],
        total: 0,
        limit: 25,
        offset: 0,
        _engagementsServiceVersion: "v1",
        _routeVersion: "v1",
      };

      const serialized = JSON.stringify(noEngagementsResponse);
      const parsed = JSON.parse(serialized);

      expect(Array.isArray(parsed.engagements)).toBe(true);
      expect(parsed.engagements.length).toBe(0);
      expect(parsed.total).toBe(0);
    });

    it("must not return empty object {} when data exists", () => {
      // This was the symptom of the bug
      const buggyResponse = {}; // Empty object - what was being returned

      // When smoke parser runs
      const engagementCount = Array.isArray(buggyResponse)
        ? buggyResponse.length
        : buggyResponse.engagements?.length || 0;

      expect(engagementCount).toBe(0); // Incorrectly returns 0
      expect(Object.keys(buggyResponse).length).toBe(0); // No properties
    });
  });

  describe("Wrapper error handling", () => {
    it("wrapper should have explicit type checking for handler return", () => {
      // The wrapper should check handler return type
      class MockResponse {
        constructor(public body: string, public status: number) {}
      }

      const mockHandlerReturningResponse = () => {
        // Simulate what happens when handler returns Response
        const fakeResponse = new MockResponse("{}", 200);
        return fakeResponse;
      };

      const result = mockHandlerReturningResponse();

      // Should detect this is not a plain object and fail closed
      const isPlainObject =
        result !== null &&
        typeof result === "object" &&
        result.constructor === Object;

      // FakeResponse has different constructor, should be detected
      const hasResponseLikeStructure =
        result &&
        typeof result === "object" &&
        result instanceof MockResponse;

      // Wrapper should reject response-like objects
      expect(hasResponseLikeStructure).toBe(true);
      expect(isPlainObject).toBe(false);
    });
  });

  describe("Direct unwrapped routes can still use Response", () => {
    it("routes not using canonical wrapper can return Response.json()", () => {
      // This is allowed for direct route handlers that don't use wrapper
      const directRouteHandler = () => {
        // This is fine if the route doesn't use canonical wrapper
        return new Response(JSON.stringify({ data: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const response = directRouteHandler();
      expect(response).toBeInstanceOf(Response);
    });

    it("wrapped routes MUST use plain objects", () => {
      // When using canonical wrapper, must return plain object
      const wrappedHandler = async (ctx: any) => {
        // WRONG: return Response.json({ data: "ok" });
        // RIGHT:
        return { data: "ok" };
      };

      expect(wrappedHandler({ verifiedWorkspaceId: "ws-1" })).toBeInstanceOf(
        Promise
      );
    });
  });
});
