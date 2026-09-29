/**
 * P2 — the target route lands where the owner can see the target. When the canonical main target lives
 * in a domain, that domain's page shows "Your overall main target" with the canonical identity (no second
 * election), at the `main-target` anchor; other domains' pages show nothing. The low-data notice follows
 * the same canonical decision.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { DomainDataGapNotice, DomainMainTargetContext } from "@/components/owner/DomainMainTargetContext";

const decision = (domain: string, supportingDomain?: string) => ({
  primaryTarget: { candidateId: "c1", source: "domain_action", domain, domainLabel: "Finance", priorityClass: "PROFIT_LOSS", findingCode: "FIN_HIGH_RECEIVABLES", title: "Collect overdue invoices", explanation: "Receivables are high.", severity: "high", status: "proposed", targetRoute: "/owner/finance" },
  supportingSteps: supportingDomain ? [{ candidateId: "c2", source: "domain_action", domain: supportingDomain, title: "Chase", status: "proposed" }] : [],
});

function stubHome(body: unknown) {
  const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ currentOwnerDecision: body }) }));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DomainMainTargetContext", () => {
  it("renders the canonical main target on its own domain's page, at the main-target anchor", async () => {
    const fetchSpy = stubHome(decision("finance"));
    const { findByTestId } = render(<DomainMainTargetContext domain="finance" businessId="b1" />);
    const block = await findByTestId("domain-main-target");
    expect(block.id).toBe("main-target");
    expect(block.textContent).toMatch(/Your overall main target/);
    expect(block.textContent).toMatch(/Collect overdue invoices/);
    expect(fetchSpy).toHaveBeenCalledWith("/api/owner/home?businessId=b1");
  });

  it("renders nothing on another domain's page (never a second election)", async () => {
    const fetchSpy = stubHome(decision("finance"));
    const { queryByTestId } = render(<DomainMainTargetContext domain="sales" businessId="b1" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(queryByTestId("domain-main-target")).toBeNull();
  });
});

describe("DomainDataGapNotice (low-data Finance page)", () => {
  it("when Finance owns a canonical step: the issue needs attention; only the score is provisional", async () => {
    stubHome(decision("sales", "finance"));
    const { findByText } = render(<DomainDataGapNotice domain="finance" domainLabel="Finance" businessId="b1" missing={["cash on hand"]} fallback="should not be acted on" />);
    expect(await findByText("The Finance issue needs attention now, but its numerical score is provisional until cash on hand is supplied.")).toBeTruthy();
  });

  it("when Finance owns no canonical step: the domain's own caution stands", async () => {
    stubHome(decision("sales"));
    const { findByTestId } = render(<DomainDataGapNotice domain="finance" domainLabel="Finance" businessId="b2" missing={["cash on hand"]} fallback="caution text" />);
    await waitFor(async () => expect((await findByTestId("domain-data-gap-notice")).textContent).toBe("caution text"));
  });
});
