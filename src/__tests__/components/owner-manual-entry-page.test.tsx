/**
 * Owner Manual Entry PAGE (PASS 45) — component proof.
 *
 * Proves the dedicated manual-entry UI is low-load, privacy-safe, and wired to the governed backend: it shows
 * the mandatory privacy warning + safe copy + placeholders, renders the essential sections expanded and the
 * optional sections collapsed (progressive disclosure), blocks a PII-bearing note client-side with redaction
 * guidance, posts a clean record to /api/owner/manual-entry and shows a saved state, links back to the cockpit,
 * and never shows forbidden copy (fake money/ROI/win-probability/hidden score/autonomous action).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import OwnerManualEntryPage from "@/app/(authenticated)/owner/manual-entry/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const posted: Array<{ path: string; body: unknown }> = [];

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  posted.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (typeof path === "string" && path.includes("/api/owner/businesses")) {
      return { ok: true, json: async () => ({ businesses: [{ id: "biz-1", name: "OWNER_BUSINESS_A" }] }) } as Response;
    }
    if (typeof path === "string" && path.includes("/api/owner/manual-entry")) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      posted.push({ path, body });
      return { ok: true, json: async () => ({ ok: true, intakeId: "intake-1", category: body?.category, confirmed: true, confidenceBefore: "low", confidenceAfter: "medium", confidenceImproved: true, suppliedAfter: [] }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderReady() {
  render(
    <ActiveBusinessProvider>
      <OwnerManualEntryPage />
    </ActiveBusinessProvider>
  );
  await waitFor(() => expect(screen.getByTestId("manual-entry-page")).toBeTruthy());
}

describe("OwnerManualEntryPage", () => {
  it("1. renders the page after loading the owner's businesses", async () => {
    await renderReady();
    expect(screen.getByTestId("manual-entry-page")).toBeTruthy();
  });

  it("2. shows the mandatory privacy warning naming forbidden fields", async () => {
    await renderReady();
    expect(screen.getByTestId("manual-entry-warning").textContent).toMatch(/phone numbers|emails|passwords|payroll/i);
  });

  it("3. shows the placeholder + no-external-action safe copy", async () => {
    await renderReady();
    const t = screen.getByTestId("manual-entry-safecopy").textContent ?? "";
    expect(t).toMatch(/CUSTOMER_001|STAFF_A|VENDOR_A/);
    expect(t).toMatch(/will not contact anyone/i);
  });

  it("4. renders the essential sections expanded", async () => {
    await renderReady();
    expect(screen.getByTestId("manual-entry-section-current_issue")).toBeTruthy();
    expect(screen.getByTestId("manual-entry-section-business_snapshot")).toBeTruthy();
  });

  it("5. renders optional sections collapsed by default (<details> without open)", async () => {
    await renderReady();
    const opt = screen.getByTestId("manual-entry-optional-cash_cost");
    expect(opt.tagName.toLowerCase()).toBe("details");
    expect((opt as HTMLDetailsElement).open).toBe(false);
  });

  it("6. blocks a PII-bearing note client-side with redaction guidance (no POST)", async () => {
    await renderReady();
    const section = screen.getByTestId("manual-entry-section-current_issue");
    fireEvent.change(within(section).getByTestId("manual-entry-note-current_issue"), { target: { value: "call Mr Smith on 07700 900123" } });
    fireEvent.click(within(section).getByTestId("manual-entry-save-current_issue"));
    await waitFor(() => expect(within(section).getByTestId("manual-entry-error-current_issue")).toBeTruthy());
    expect(within(section).getByTestId("manual-entry-error-current_issue").textContent).toMatch(/personal data detected|placeholder like CUSTOMER_001/i);
    expect(posted.length).toBe(0);
  });

  it("7. requires an operational note before saving", async () => {
    await renderReady();
    const section = screen.getByTestId("manual-entry-section-current_issue");
    fireEvent.click(within(section).getByTestId("manual-entry-save-current_issue"));
    await waitFor(() => expect(within(section).getByTestId("manual-entry-error-current_issue")).toBeTruthy());
    expect(posted.length).toBe(0);
  });

  it("8. posts a clean record to /api/owner/manual-entry and shows a saved state", async () => {
    await renderReady();
    const section = screen.getByTestId("manual-entry-section-current_issue");
    fireEvent.change(within(section).getByTestId("manual-entry-note-current_issue"), { target: { value: "late deliveries on several orders this week" } });
    fireEvent.click(within(section).getByTestId("manual-entry-save-current_issue"));
    await waitFor(() => expect(within(section).getByTestId("manual-entry-saved-current_issue")).toBeTruthy());
    expect(posted.length).toBe(1);
    expect((posted[0].body as { businessId: string }).businessId).toBe("biz-1");
    expect((posted[0].body as { category: string }).category).toBe("proof_completion");
    expect((posted[0].body as { fields: Record<string, unknown> }).fields.note).toMatch(/late deliveries/);
    expect((posted[0].body as { confirm: boolean }).confirm).toBe(true);
  });

  it("9. links back to the owner cockpit", async () => {
    await renderReady();
    expect(screen.getByTestId("manual-entry-cockpit-link").getAttribute("href")).toBe("/owner/cockpit");
  });

  it("10. shows no forbidden copy (fake money / ROI / win-probability / hidden score / autonomous action)", async () => {
    await renderReady();
    const html = screen.getByTestId("manual-entry-page").innerHTML.toLowerCase();
    expect(html).not.toMatch(/[$£€]\s?\d|\broi\b|win probability|\bhidden score\b|guaranteed (recovery|profit|success)|fully autonomous|auto-submit|auto-contact/);
  });
});
