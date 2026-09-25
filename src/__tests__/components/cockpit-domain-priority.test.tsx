/**
 * Beta integrity BIV-03: Home must reflect open work from the Sales/Strategy/... diagnoses and must
 * never tell an owner who has a business that they "haven't added" one.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { CockpitDomainPriority } from "@/services/owner-guidance/cockpit-domain-priority.service";
import type { CockpitFinancePriority } from "@/services/owner-guidance/cockpit-finance-priority.service";

afterEach(() => cleanup());

const emptyBridge = { routes: [], topRoute: null, summary: { total: 0, ownerApproval: 0, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
const noop = () => {};
const salesPriority: CockpitDomainPriority = {
  businessId: "b1", domain: "sales", domainLabel: "Sales", title: "Provide missing sales inputs",
  status: "in_progress", priorityScore: 70, href: "/owner/sales",
};
const financePriority: CockpitFinancePriority = {
  businessId: "b1", businessName: "Biz", cycleId: "c1", generatedAt: new Date().toISOString(),
  survivalState: "SAFE", overallHealthScore: 60, topAction: { id: "f1", title: "Chase receivables", description: "d", priorityScore: 60 },
};

describe("cockpit domain priority (BIV-03)", () => {
  it("clean state with an open Sales action shows it as the primary item, not 'No urgent action'", () => {
    const { getByTestId, queryByText } = render(
      <MinimumOwnerCockpit bridge={emptyBridge} onAction={noop} domainTopPriority={salesPriority} />
    );
    expect(getByTestId("cockpit-domain-priority-primary").textContent).toContain("Provide missing sales inputs");
    expect(getByTestId("cockpit-domain-priority-primary").querySelector("a")?.getAttribute("href")).toBe("/owner/sales");
    expect(queryByText(/No urgent action/i)).toBeNull();
  });

  it("Finance keeps the primary slot; the domain action is still shown as secondary", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={emptyBridge} onAction={noop} financeTopPriority={financePriority} domainTopPriority={salesPriority} />
    );
    expect(getByTestId("cockpit-finance-priority-primary")).toBeTruthy();
    expect(getByTestId("cockpit-domain-priority-secondary").textContent).toContain("Provide missing sales inputs");
  });

  it("'Haven't added your business yet?' is shown only when the owner has no business", () => {
    const withBusiness = render(<MinimumOwnerCockpit bridge={emptyBridge} onAction={noop} hasBusiness />);
    expect(withBusiness.queryByText(/Haven.t added your business yet/)).toBeNull();
    expect(withBusiness.getByText(/No urgent action/i)).toBeTruthy();
    cleanup();
    const noBusiness = render(<MinimumOwnerCockpit bridge={emptyBridge} onAction={noop} hasBusiness={false} />);
    expect(noBusiness.getByText(/Haven.t added your business yet/)).toBeTruthy();
  });
});
