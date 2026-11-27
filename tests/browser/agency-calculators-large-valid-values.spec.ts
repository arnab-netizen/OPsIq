import { test, expect, type Page } from "@playwright/test";

/**
 * Valid, large, realistic values (not invalid sentinels). The earlier layout acceptance typed an invalid sentinel
 * into every input, which removes the result tables and so cannot detect a table-driven overflow. Each case here
 * keeps the calculation valid: the result tables must still be present after the edit, and the document, form,
 * result panel and every table container must fit the viewport.
 */
const CASES: { slug: string; values: Record<string, string> }[] = [
  { slug: "client-profitability-calculator", values: {
    "Client revenue": "1250000", "Pass-through expenses": "200000", "Delivery hours: main team": "1500",
    "Loaded staff cost per hour: main team": "125", "Delivery hours: second role": "400",
    "Loaded staff cost per hour: second role": "180", "Other direct delivery costs": "50000", "Target delivery margin": "45" } },
  { slug: "agency-retainer-pricing-calculator", values: {
    "Estimated monthly delivery hours": "320", "Loaded delivery cost per hour": "145", "Other direct monthly costs": "25000",
    "Pass-through expenses per month": "12000", "Target delivery margin": "55", "A fee you are considering": "85000" } },
  { slug: "agency-utilization-calculator", values: {
    "Team members counted": "48", "Paid hours per person per month": "168", "Leave and holiday hours": "24",
    "Revenue-generating delivery hours": "6100", "Your target utilization": "82", "Effective earned hourly rate": "185" } },
  { slug: "agency-scope-creep-calculator", values: {
    "Agreed agency fee": "350000", "Planned delivery hours": "1800", "Additional unpriced hours": "420",
    "Loaded delivery cost per hour": "140", "Planned direct expenses": "10000", "Additional direct expenses": "7500",
    "Approved change-order revenue": "42000", "Margin to price a change order at": "55" } },
  { slug: "agency-hourly-rate-calculator", values: {
    "Annual delivery payroll": "9600000", "Annual agency overhead": "4200000", "Annual available delivery capacity": "190000",
    "Target utilization": "72", "Target operating margin": "22" } },
  { slug: "agency-capacity-calculator", values: {
    "Delivery staff": "85", "Available hours per person per month": "150", "Your target delivery utilization": "78",
    "Existing committed client workload": "8900", "Estimated workload per additional client": "120", "New clients you are considering": "14" } },
  { slug: "profit-margin-calculator", values: {
    "Revenue invoiced": "4800000", "Direct delivery costs": "1900000", "Operating expenses": "1500000", "Cash in the bank today": "600000",
    "Total owed to you": "800000", "Of that, overdue 30+ days": "400000", "Cash you realistically expect in 30 days": "250000", "Bills and payroll due in 30 days": "700000" } },
];

async function fill(page: Page, values: Record<string, string>) {
  for (const [prefix, value] of Object.entries(values)) {
    const field = page.locator("form").getByLabel(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    await expect(field, `field "${prefix}"`).toHaveCount(1);
    await field.fill(value);
  }
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const d = document.documentElement, cw = d.clientWidth;
    const sc = (e: Element | null): Element | null => { let p = e && e.parentElement; while (p && p !== document.body) { if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return p; p = p.parentElement; } return null; };
    const sec = document.querySelector("section[aria-labelledby]");
    const box = (e: Element | null | undefined) => (e ? e.getBoundingClientRect() : null);
    const form = box(sec && sec.querySelector("form")), result = box(sec && sec.querySelector("div[aria-live]"));
    const tables = [...document.querySelectorAll("table")].map((t) => { const c = sc(t); const r = c && c.getBoundingClientRect(); return { fits: !!r && r.left >= -1 && r.right <= cw + 1, focusable: !!c && (c as HTMLElement).tabIndex >= 0 }; });
    return { cw, sw: d.scrollWidth, bodySw: document.body.scrollWidth, formRight: form ? form.right : 0, resultRight: result ? result.right : 0, tables };
  });
}

for (const c of CASES) {
  for (const width of [320, 390, 768]) {
    test(`${c.slug} @ ${width}px: valid large values keep tables and fit the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tools/${c.slug}`, { waitUntil: "networkidle" });
      const before = (await measure(page)).tables.length;
      await fill(page, c.values);
      await page.waitForTimeout(400);
      const m = await measure(page);
      expect(m.tables.length, "result tables must survive a valid edit (invalid input would remove them)").toBeGreaterThanOrEqual(before);
      expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
      expect(m.bodySw).toBeLessThanOrEqual(m.cw + 1);
      expect(m.formRight).toBeLessThanOrEqual(m.cw + 1);
      expect(m.resultRight).toBeLessThanOrEqual(m.cw + 1);
      for (const t of m.tables) { expect(t.fits).toBe(true); expect(t.focusable).toBe(true); }
      const text = await page.locator("section[aria-labelledby] div[aria-live]").innerText();
      expect(text.trim().length, "a result must be rendered").toBeGreaterThan(40);
    });
  }
}
