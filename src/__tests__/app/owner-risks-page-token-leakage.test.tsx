/**
 * Owner Risks page — raw internal identifier leakage regression.
 *
 * A real human usability test saw a raw internal risk code (e.g. `startup_b48c5a32_demand`)
 * rendered as the owner-facing identifier. The list view used to have a dedicated "Code" column
 * showing `risk.riskCode` raw next to the human title. This proves the list only ever renders the
 * plain-language title, never the raw code — the raw code is a real field, it just must never
 * reach ordinary owner-facing copy.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import RisksPage from "@/app/(authenticated)/owner/risks/page";

const RISKS = [
  {
    id: "risk-uuid-1",
    riskCode: "startup_b48c5a32_demand",
    title: "Demand risk — customers may not pay",
    description: null,
    category: "MARKET",
    likelihood: 60,
    impact: 70,
    severity: 65,
    status: "IDENTIFIED",
    mitigationAction: null,
    residualRisk: null,
    linkedObjectiveId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/api/owner/risks") && method === "GET") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ risks: RISKS }) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RisksPage — raw riskCode is never owner-facing", () => {
  it("renders the plain-language title but never the raw riskCode token", async () => {
    const { container, findByText } = render(<RisksPage />);
    await findByText("Demand risk — customers may not pay");
    const text = container.textContent ?? "";
    expect(text).not.toContain("startup_b48c5a32_demand");
    expect(text).not.toMatch(/\bstartup_[a-f0-9]{6,}_[a-z]+\b/);
  });

  it("does not render a dedicated 'Code' table column", async () => {
    const { container, findByText } = render(<RisksPage />);
    await findByText("Demand risk — customers may not pay");
    const headers = Array.from(container.querySelectorAll("th")).map((th) => th.textContent?.trim());
    expect(headers).not.toContain("Code");
  });
});
