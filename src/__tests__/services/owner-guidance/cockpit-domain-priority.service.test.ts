/** Beta integrity BIV-03: cockpit domain priority selection over the owner-home aggregation. */
import { describe, it, expect, vi } from "vitest";
import { getCockpitDomainPriority } from "@/services/owner-guidance/cockpit-domain-priority.service";

type Home = Awaited<ReturnType<typeof import("@/services/owner-home/home.service").getOwnerHome>>;

function home(requiredActions: Array<{ domain: string; title: string; status?: string; priorityScore?: number }>, selected: string | null = "b1"): Home {
  return {
    businesses: [],
    selectedBusinessId: selected,
    hasData: selected !== null,
    domainsWired: [],
    summary: selected
      ? ({
          requiredActions: requiredActions.map((a) => ({
            findingCode: "F", ownerRole: "owner", expectedImpactScore: 50, effortScore: 50, verificationMetric: "m",
            status: "proposed", priorityScore: 50, ...a,
          })),
        } as unknown as Home["summary"])
      : null,
  };
}

describe("getCockpitDomainPriority", () => {
  it("returns the highest-ranked open non-finance action with its module link", async () => {
    const getOwnerHome = vi.fn().mockResolvedValue(home([
      { domain: "finance", title: "Finance first" },
      { domain: "strategy", title: "Secure funding or stage the spend", status: "proposed", priorityScore: 62 },
    ]));
    const p = await getCockpitDomainPriority("ws", "b1", { getOwnerHome });
    expect(getOwnerHome).toHaveBeenCalledWith("ws", "b1");
    expect(p).toMatchObject({ domain: "strategy", domainLabel: "Strategy", href: "/owner/strategy", title: "Secure funding or stage the spend" });
  });

  it("fails closed (null) when no business is resolved", async () => {
    const getOwnerHome = vi.fn().mockResolvedValue(home([], null));
    expect(await getCockpitDomainPriority("ws", null, { getOwnerHome })).toBeNull();
  });

  it("null when only finance actions are open (finance has its own card)", async () => {
    const getOwnerHome = vi.fn().mockResolvedValue(home([{ domain: "finance", title: "x" }]));
    expect(await getCockpitDomainPriority("ws", "b1", { getOwnerHome })).toBeNull();
  });

  it("the execution domain (sop) links to /owner/execution", async () => {
    const getOwnerHome = vi.fn().mockResolvedValue(home([{ domain: "sop", title: "Write the SOP" }]));
    expect(await getCockpitDomainPriority("ws", "b1", { getOwnerHome })).toMatchObject({ href: "/owner/execution", domainLabel: "Execution" });
  });
});
