/**
 * Round 10 P2-6 — the DNR panel's interpreted focus (from a direct #dnr-rule-<id> link or from the
 * canonical `focusRuleId` prop) is scoped to the business it was resolved for. Reproduces on 14c36b12
 * (a hash focus read while viewing business A survived a switch to B with no business tag, so once B's own
 * rules loaded — never containing A's rule id — the panel wrongly told the owner "the rule that was named
 * is no longer in force for this business", implying A's rule once applied to B) and passes now.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { OwnerDoNotRepeatPanel } from "@/components/owner/OwnerDoNotRepeatPanel";

const RULE_A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", summary: "A's rule", reason: "Did not work for A", changedContextExplanation: null, holds: "sales", createdAt: "2026-01-01T00:00:00Z" };
const RULE_B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", summary: "B's rule", reason: "Did not work for B", changedContextExplanation: null, holds: "marketing", createdAt: "2026-01-01T00:00:00Z" };

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const businessId = new URL(url, "http://test.local").searchParams.get("businessId");
      const rules = businessId === "biz-a" ? [RULE_A] : businessId === "biz-b" ? [RULE_B] : [];
      return { ok: true, status: 200, json: async () => ({ rules }) } as Response;
    })
  );
}

// jsdom does not implement scrollIntoView; the panel calls it when focusing a listed rule.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("OwnerDoNotRepeatPanel — R10 P2-6 business-scoped focus", () => {
  it("a hash focus resolved for business A never shows A's rule or A's 'no longer in force' message under business B", async () => {
    installFetchMock();
    window.location.hash = `#dnr-rule-${RULE_A.id}`;
    const { rerender } = render(<OwnerDoNotRepeatPanel businessId="biz-a" onChanged={() => {}} />);

    // Business A: the hash focus resolves and A's rule is shown, focused.
    await waitFor(() => expect(screen.getByText("A's rule")).toBeTruthy());
    expect(screen.getByText("A's rule").closest("li")?.getAttribute("data-focused")).toBe("true");
    expect(screen.queryByText(/no longer in force/i)).toBeNull();

    // Switch to business B. The SAME hash is still in the URL (never cleared -- direct linking survives),
    // but it must never be interpreted as B's focus, never show A's rule, and never claim A's rule "is no
    // longer in force for this business" (which would falsely imply it once applied to B).
    rerender(<OwnerDoNotRepeatPanel businessId="biz-b" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("B's rule")).toBeTruthy());
    expect(screen.queryByText("A's rule")).toBeNull();
    expect(screen.queryByText(/no longer in force/i)).toBeNull();
    expect(screen.getByText("B's rule").closest("li")?.getAttribute("data-focused")).toBeNull();
  });

  it("the canonical focusRuleId prop is also cleared instantly on a business switch (never carries A's id into B's render)", async () => {
    installFetchMock();
    const { rerender } = render(<OwnerDoNotRepeatPanel businessId="biz-a" onChanged={() => {}} focusRuleId={RULE_A.id} />);
    await waitFor(() => expect(screen.getByText("A's rule").closest("li")?.getAttribute("data-focused")).toBe("true"));

    // The caller (Cockpit) clears focusRuleId to null the instant a business switch starts (before B's own
    // annotation has loaded) -- simulated here by the prop going to null in the same render as businessId.
    rerender(<OwnerDoNotRepeatPanel businessId="biz-b" onChanged={() => {}} focusRuleId={null} />);
    await waitFor(() => expect(screen.getByText("B's rule")).toBeTruthy());
    expect(screen.queryByText(/no longer in force/i)).toBeNull();
    expect(screen.getByText("B's rule").closest("li")?.getAttribute("data-focused")).toBeNull();
  });

  it("a direct link that is genuinely valid for the CURRENT business still focuses it", async () => {
    installFetchMock();
    window.location.hash = `#dnr-rule-${RULE_B.id}`;
    render(<OwnerDoNotRepeatPanel businessId="biz-b" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("B's rule").closest("li")?.getAttribute("data-focused")).toBe("true"));
  });

  it("hostile-review fix: a direct link followed while businessId is still null (active-business context still loading) resolves focus once businessId arrives, with no hashchange event", async () => {
    installFetchMock();
    window.location.hash = `#dnr-rule-${RULE_B.id}`;
    // Mounts with businessId=null, exactly as Cockpit does while ActiveBusinessContext is still
    // resolving — no hashchange event ever fires here, since the URL hash never moves.
    const { rerender } = render(<OwnerDoNotRepeatPanel businessId={null} onChanged={() => {}} />);
    expect(screen.queryByText("B's rule")).toBeNull();

    rerender(<OwnerDoNotRepeatPanel businessId="biz-b" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("B's rule")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("B's rule").closest("li")?.getAttribute("data-focused")).toBe("true"));
  });

  it("hostile-review fix: the null-to-id resolution fires only once — a later business switch does not re-resolve a stale hash", async () => {
    installFetchMock();
    window.location.hash = `#dnr-rule-${RULE_A.id}`;
    const { rerender } = render(<OwnerDoNotRepeatPanel businessId={null} onChanged={() => {}} />);
    rerender(<OwnerDoNotRepeatPanel businessId="biz-a" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("A's rule").closest("li")?.getAttribute("data-focused")).toBe("true"));

    // Switching away and back must not re-trigger the one-time null->id resolution as if this were
    // a fresh direct link — B never focuses A's rule id.
    rerender(<OwnerDoNotRepeatPanel businessId="biz-b" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText("B's rule")).toBeTruthy());
    expect(screen.queryByText("A's rule")).toBeNull();
    expect(screen.getByText("B's rule").closest("li")?.getAttribute("data-focused")).toBeNull();
  });
});
