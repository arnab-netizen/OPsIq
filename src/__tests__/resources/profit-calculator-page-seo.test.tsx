/**
 * SEO contract for /tools/profit-margin-calculator (jsdom).
 *
 * Guards the things that decide whether the page can be found and shown well: a title and
 * description short enough not to be truncated, a canonical without query strings, valid
 * FAQPage / BreadcrumbList / WebApplication JSON-LD, and FAQ markup that matches the visible text.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import ProfitMarginCalculatorPage, { metadata } from "@/app/tools/profit-margin-calculator/page";

afterEach(cleanup);

function readJsonLd(): { "@graph": Array<Record<string, unknown>> } {
  const script = document.querySelector('script[type="application/ld+json"]');
  expect(script).not.toBeNull();
  return JSON.parse(script!.textContent ?? "");
}

describe("profit margin calculator page SEO", () => {
  it("keeps title and description inside search-result limits", () => {
    expect(String(metadata.title).length).toBeLessThanOrEqual(60);
    expect(String(metadata.title).toLowerCase()).toContain("profit margin calculator");
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
  });

  it("uses a clean canonical URL with no query string", () => {
    expect(metadata.alternates?.canonical).toBe("https://opsiq.solutions/tools/profit-margin-calculator");
  });

  it("has one h1 and links to the related guide and the resources index", () => {
    render(<ProfitMarginCalculatorPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/resources/profitable-but-short-on-cash");
    expect(hrefs).toContain("/resources");
  });

  it("emits WebApplication, FAQPage and BreadcrumbList structured data", () => {
    render(<ProfitMarginCalculatorPage />);
    const types = readJsonLd()["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(["WebApplication", "FAQPage", "BreadcrumbList"]);
  });

  it("FAQ structured data matches the questions and answers shown on the page", () => {
    render(<ProfitMarginCalculatorPage />);
    const faq = readJsonLd()["@graph"].find((n) => n["@type"] === "FAQPage") as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    const pageText = document.body.textContent ?? "";
    for (const q of faq.mainEntity) {
      expect(screen.getByRole("heading", { level: 3, name: q.name })).toBeInTheDocument();
      expect(pageText).toContain(q.acceptedAnswer.text);
    }
  });

  it("breadcrumb items are absolute canonical URLs in order", () => {
    render(<ProfitMarginCalculatorPage />);
    const crumbs = readJsonLd()["@graph"].find((n) => n["@type"] === "BreadcrumbList") as {
      itemListElement: Array<{ position: number; item: string }>;
    };
    expect(crumbs.itemListElement.map((c) => c.position)).toEqual([1, 2]);
    expect(crumbs.itemListElement.map((c) => c.item)).toEqual([
      "https://opsiq.solutions/",
      "https://opsiq.solutions/tools/profit-margin-calculator",
    ]);
  });
});
