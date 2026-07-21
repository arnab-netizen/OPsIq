/**
 * Regression tests for the canonical BigInt serialization fix.
 *
 * Root cause: JSON.stringify in canonical-route-enforcement.ts had no BigInt
 * replacer. Routes returning Prisma data with BigInt fields (e.g.
 * expectedCostCents, spendingLimitCents) caused a TypeError at serialization
 * time, converted by the enforcement wrapper to HTTP 500.
 *
 * Fix: stringifyRouteResponse() in canonical-json-response.ts — one canonical
 * implementation imported at both route-response serialization call sites.
 *
 * Tests must FAIL against the old JSON.stringify path and PASS against
 * stringifyRouteResponse.
 */

import { describe, it, expect } from "vitest";
import { stringifyRouteResponse } from "@/lib/canonical-json-response";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── 1. Proof that plain JSON.stringify throws on BigInt ───────────────────
describe("Proof: plain JSON.stringify cannot serialize BigInt", () => {
  it("throws TypeError on top-level BigInt — old code path would 500", () => {
    expect(() => JSON.stringify({ costCents: 1250000n })).toThrow(TypeError);
  });

  it("throws TypeError on nested BigInt", () => {
    expect(() => JSON.stringify({ idea: { costCents: 99n } })).toThrow(TypeError);
  });

  it("throws TypeError on array containing BigInt", () => {
    expect(() => JSON.stringify([{ a: 1n }, { b: 2n }])).toThrow(TypeError);
  });
});

// ─── 2. stringifyRouteResponse — all required cases ───────────────────────
describe("stringifyRouteResponse", () => {
  it("1. top-level BigInt serialises to decimal string", () => {
    const result = JSON.parse(stringifyRouteResponse({ costCents: 1250000n }));
    expect(result.costCents).toBe("1250000");
  });

  it("2. nested object BigInt serialises", () => {
    const result = JSON.parse(stringifyRouteResponse({ idea: { cost: 500n } }));
    expect(result.idea.cost).toBe("500");
  });

  it("3. array of BigInt-containing records serialises", () => {
    const result = JSON.parse(
      stringifyRouteResponse([{ a: 1n }, { b: 2n }])
    );
    expect(result[0].a).toBe("1");
    expect(result[1].b).toBe("2");
  });

  it("4. Prisma-like object with multiple BigInt fields", () => {
    const prismaLike = {
      id: "abc",
      name: "Mobile Car Detailing",
      startupCostCents: 5000000n,
      fixedMonthlyCostCents: 100000n,
      variableUnitCostCents: 2500n,
      pricePerUnitCents: 8000n,
      cacCents: 1500n,
      workingCapitalCents: 200000n,
    };
    const result = JSON.parse(stringifyRouteResponse(prismaLike));
    expect(result.id).toBe("abc");
    expect(result.name).toBe("Mobile Car Detailing");
    expect(result.startupCostCents).toBe("5000000");
    expect(result.fixedMonthlyCostCents).toBe("100000");
    expect(result.variableUnitCostCents).toBe("2500");
    expect(result.pricePerUnitCents).toBe("8000");
    expect(result.cacCents).toBe("1500");
    expect(result.workingCapitalCents).toBe("200000");
  });

  it("5. null BigInt-typed fields remain null", () => {
    const result = JSON.parse(
      stringifyRouteResponse({ spendingLimitCents: null })
    );
    expect(result.spendingLimitCents).toBeNull();
  });

  it("6. undefined fields are dropped (standard behaviour)", () => {
    const result = JSON.parse(
      stringifyRouteResponse({ a: 1, b: undefined })
    );
    expect(result.a).toBe(1);
    expect("b" in result).toBe(false);
  });

  it("7. Date serialisation unchanged (ISO string)", () => {
    const d = new Date("2025-01-01T00:00:00.000Z");
    const result = JSON.parse(stringifyRouteResponse({ createdAt: d }));
    expect(result.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("8. safe integer number unchanged — not coerced to string", () => {
    const result = JSON.parse(stringifyRouteResponse({ count: 42, score: 99 }));
    expect(result.count).toBe(42);
    expect(result.score).toBe(99);
    expect(typeof result.count).toBe("number");
  });

  it("9. value above Number.MAX_SAFE_INTEGER preserved exactly as string", () => {
    // 9007199254740993 = Number.MAX_SAFE_INTEGER + 2
    // JSON.parse would coerce this to 9007199254740992 as a number
    const large = 9007199254740993n;
    const raw = stringifyRouteResponse({ amount: large });
    // Wire value must be the exact decimal string
    expect(raw).toContain('"9007199254740993"');
    // Parse confirms exact string representation, not a rounded number
    const result = JSON.parse(raw);
    expect(result.amount).toBe("9007199254740993");
    expect(typeof result.amount).toBe("string");
  });

  it("10. strings remain strings", () => {
    const result = JSON.parse(stringifyRouteResponse({ name: "hello" }));
    expect(result.name).toBe("hello");
    expect(typeof result.name).toBe("string");
  });

  it("11. booleans remain booleans", () => {
    const result = JSON.parse(stringifyRouteResponse({ active: true, soft: false }));
    expect(result.active).toBe(true);
    expect(result.soft).toBe(false);
    expect(typeof result.active).toBe("boolean");
  });

  it("12. ordinary decimal-like objects are not affected", () => {
    // A plain object with string "amount" should not be changed
    const result = JSON.parse(stringifyRouteResponse({ amount: "12.50" }));
    expect(result.amount).toBe("12.50");
  });

  it("13. circular reference still throws TypeError (not hidden)", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => stringifyRouteResponse(obj)).toThrow(TypeError);
  });

  it("14. source value is not mutated", () => {
    const original = { costCents: 1000n };
    stringifyRouteResponse(original);
    // BigInt field still BigInt on the original
    expect(typeof original.costCents).toBe("bigint");
    expect(original.costCents).toBe(1000n);
  });

  it("15. deeply nested BigInts serialize", () => {
    const deep = { a: { b: { c: { d: { amount: 42n } } } } };
    const result = JSON.parse(stringifyRouteResponse(deep));
    expect(result.a.b.c.d.amount).toBe("42");
  });
});

// ─── 3. Prove the canonical enforcement module uses stringifyRouteResponse ─
describe("canonical-route-enforcement uses stringifyRouteResponse at all route-response call sites", () => {
  it("imports stringifyRouteResponse from canonical-json-response", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/canonical-route-enforcement.ts"),
      "utf8"
    );
    expect(source).toContain("stringifyRouteResponse");
    expect(source).toContain('from "@/lib/canonical-json-response"');
  });

  it("every route-response NextResponse call uses stringifyRouteResponse, not raw JSON.stringify", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/canonical-route-enforcement.ts"),
      "utf8"
    );

    // Extract all lines that contain new NextResponse( to find serialization calls
    const lines = source.split("\n");
    const responseLines = lines
      .map((line, i) => ({ line, i: i + 1 }))
      .filter(({ line }) => line.includes("new NextResponse("));

    // Collect the argument of each NextResponse call (next line if multi-line, same line if inline)
    // We look for any that use JSON.stringify directly with responseBody
    const rawStringifyUsed = lines.some((line) =>
      line.includes("JSON.stringify(responseBody")
    );

    expect(rawStringifyUsed).toBe(false);
  });

  it("idea detail route has no route-local BigInt workaround", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/route.ts"
      ),
      "utf8"
    );
    expect(source).not.toContain("typeof v === \"bigint\"");
    expect(source).not.toContain("JSON.parse(JSON.stringify");
  });
});

// ─── 4. Wire contract: spendingLimitCents and expectedCostCents ───────────
describe("Phase 5 BigInt wire contract", () => {
  it("spendingLimitCents (StartupOwnerDecision) serialises as decimal string", () => {
    const decision = {
      id: "d1",
      decisionType: "GO",
      spendingLimitCents: 500000n,
    };
    const result = JSON.parse(stringifyRouteResponse({ ownerDecision: decision }));
    expect(result.ownerDecision.spendingLimitCents).toBe("500000");
    expect(typeof result.ownerDecision.spendingLimitCents).toBe("string");
  });

  it("expectedCostCents (StartupHypothesis) serialises as decimal string", () => {
    const hypotheses = [
      { id: "h1", statement: "Customers will pay", expectedCostCents: 25000n },
      { id: "h2", statement: "Supplier available", expectedCostCents: null },
    ];
    const result = JSON.parse(stringifyRouteResponse({ hypotheses }));
    expect(result.hypotheses[0].expectedCostCents).toBe("25000");
    expect(result.hypotheses[1].expectedCostCents).toBeNull();
  });

  it("all StartupEconomicModel BigInt fields serialise", () => {
    const model = {
      startupCostCents: 5000000n,
      fixedMonthlyCostCents: 200000n,
      variableUnitCostCents: 3500n,
      pricePerUnitCents: 9900n,
      cacCents: 1200n,
      workingCapitalCents: 300000n,
    };
    const result = JSON.parse(stringifyRouteResponse({ model }));
    expect(result.model.startupCostCents).toBe("5000000");
    expect(result.model.fixedMonthlyCostCents).toBe("200000");
    expect(result.model.variableUnitCostCents).toBe("3500");
    expect(result.model.pricePerUnitCents).toBe("9900");
    expect(result.model.cacCents).toBe("1200");
    expect(result.model.workingCapitalCents).toBe("300000");
  });

  it("StartupMarketSizing BigInt fields serialise", () => {
    const sizing = {
      reachableMarketUnits: 1000000n,
      reachableMarketRevenueCents: 9007199254740993n, // above MAX_SAFE_INTEGER
      serviceableUnits: 50000n,
      serviceableRevenueCents: 450000000n,
      capacityLimitedRevenueCents: 120000000n,
    };
    const result = JSON.parse(stringifyRouteResponse({ sizing }));
    expect(result.sizing.reachableMarketRevenueCents).toBe("9007199254740993");
    // Confirm exact string, no numeric rounding
    expect(result.sizing.reachableMarketRevenueCents).not.toBe(
      String(Number(9007199254740993n))
    );
  });
});
