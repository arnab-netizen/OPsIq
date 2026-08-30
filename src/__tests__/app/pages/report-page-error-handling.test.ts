/**
 * Regression test: Reports page permanent "Couldn't connect to the server" bug.
 *
 * Root cause (see src/lib/operator-safe-errors-http-classification.test.ts for
 * the classification-layer proof): the page discarded the real HTTP status and
 * API error body on any non-ok response, throwing a generic
 * `new Error("Failed to fetch report")` whose text collided with the
 * classifier's network-error keyword check. Separately, the API route wrapped
 * every internal failure from generateReport() in `BadRequestError`,
 * mislabeling real server errors as 400s.
 *
 * These are source-inspection tests (matching this repo's existing convention
 * for page-level regression coverage, e.g. admin-billing.test.ts) since the
 * page is a plain client-fetch effect with no component-level test harness
 * wired up here.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pagePath = path.resolve(__dirname, "../../../app/(authenticated)/report/page.tsx");
const routePath = path.resolve(__dirname, "../../../app/api/report/route.ts");

describe("Report page error handling", () => {
  const pageContent = fs.readFileSync(pagePath, "utf-8");

  it("does not discard the response behind a generic 'Failed to fetch' message", () => {
    // This exact string is the defect: it destroys the real status/body AND
    // its own wording ("fetch") collides with the network-error classifier.
    expect(pageContent).not.toContain('throw new Error("Failed to fetch report")');
  });

  it("builds its thrown error from the real fetch Response via toHttpResponseError", () => {
    expect(pageContent).toContain("toHttpResponseError");
    expect(pageContent).toMatch(/throw await toHttpResponseError\(response\)/);
  });

  it("still routes the error through the centralized governance classifier", () => {
    expect(pageContent).toContain("classifyOperatorError");
  });
});

describe("Report API route error handling", () => {
  const routeContent = fs.readFileSync(routePath, "utf-8");

  it("no longer collapses every generateReport() failure into a 400 client error", () => {
    // A local try/catch used to rethrow every generateReport() failure as
    // `new BadRequestError(...)` (400), mislabeling genuine 500-class
    // internal failures as client errors. withCanonicalEnforcement's own
    // catch already classifies uncaught errors safely (500 with a generic
    // message) -- see canonical-route-enforcement.ts -- so the route now
    // trusts it instead of importing/throwing BadRequestError itself.
    expect(routeContent).not.toMatch(/import\s*\{[^}]*\bBadRequestError\b/);
    expect(routeContent).not.toContain("new BadRequestError(");
    expect(routeContent).not.toContain("try {");
  });

  it("still enforces the SYSTEM_VIEW_AUDIT capability and workspace scope", () => {
    expect(routeContent).toContain("CAPABILITIES.SYSTEM_VIEW_AUDIT");
    expect(routeContent).toContain("requireWorkspace: true");
  });
});
