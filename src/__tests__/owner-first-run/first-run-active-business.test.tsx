// @vitest-environment jsdom
/**
 * Business-context invariant for the first-run flow: it is about the ACTIVE business (the header's), not the oldest one.
 * Same root cause as onboarding-active-business.test.tsx: a business-scoped form must default to the active business.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";

const api = vi.hoisted(() => ({
  context: vi.fn(), result: vi.fn(), markViewed: vi.fn(), accept: vi.fn(), correct: vi.fn(),
  improve: vi.fn(), skipQuestion: vi.fn(), nextQuestion: vi.fn(), feedback: vi.fn(), createBusiness: vi.fn(), improveTarget: vi.fn(),
}));
const active = vi.hoisted(() => ({ value: { activeBusinessId: "b-active" as string | null, loading: false } }));
vi.mock("@/lib/owner-first-run-client", () => ({ firstRunApi: api, newIdempotencyKey: () => "k" }));
vi.mock("@/lib/owner-quick-start", () => ({ retryDiagnosis: vi.fn() }));
vi.mock("@/context/active-business-context", () => ({
  useActiveBusiness: () => ({ refreshBusinesses: vi.fn(), setActiveBusinessId: vi.fn(), ...active.value }),
}));
vi.mock("@/components/owner/QuickFinancialPicture", () => ({ QuickFinancialPicture: () => <div data-testid="quick-stub" /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { FirstRunFlow } from "@/components/owner/first-run/FirstRunFlow";

const ctxFor = (id: string) => ({
  state: "NEEDS_EVIDENCE", href: "/owner/first-run", loginHref: "/owner/cockpit", facts: {}, suggestedBusinessName: "x",
  business: { id, name: id, businessType: "laundry_local_service", currency: "INR" },
  currentSnapshotId: null, latestCycleId: null, diagnosisStale: false, staleReason: null, firstTrustedInteractionAt: null, businessTypes: [], goalFamilies: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  active.value = { activeBusinessId: "b-active", loading: false };
  api.context.mockImplementation((id?: string | null) => Promise.resolve(ctxFor(id ?? "b-oldest")));
});
afterEach(() => cleanup());

describe("first-run follows the active business", () => {
  it("asks the server for the active business, not the default oldest one", async () => {
    render(<FirstRunFlow />);
    await waitFor(() => expect(api.context).toHaveBeenCalledWith("b-active"));
    expect(api.context).not.toHaveBeenCalledWith(undefined);
  });

  it("waits for the business context to resolve before loading anything", async () => {
    active.value = { activeBusinessId: null, loading: true };
    render(<FirstRunFlow />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.context).not.toHaveBeenCalled();
  });

  it("an owner with no business yet still loads the (business-less) flow", async () => {
    active.value = { activeBusinessId: null, loading: false };
    render(<FirstRunFlow />);
    await waitFor(() => expect(api.context).toHaveBeenCalledWith(null));
  });
});
