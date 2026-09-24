/**
 * Resource pages + generic renderer (jsdom).
 *
 * The repository module is mocked with the Resource #1 structural fixture so
 * the real page components, renderer, and CTA are exercised end to end
 * without publishing anything to content/resources.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { parseResourceDocument, type ResourceDocument } from "@/domain/resources/resource-content";

const fixture = parseResourceDocument(
  "profitable-but-short-on-cash",
  fs.readFileSync(path.join(__dirname, "fixtures", "resource-1-structure.md"), "utf8")
);

const state = vi.hoisted(() => ({ docs: [] as ResourceDocument[] }));

vi.mock("@/services/resources/resource-repository", () => ({
  listVisibleResources: () => state.docs,
  getVisibleResource: (slug: string) => state.docs.find((d) => d.slug === slug) ?? null,
}));

import ResourcesIndexPage from "@/app/resources/page";
import ResourcePage, { generateMetadata, generateStaticParams, dynamicParams } from "@/app/resources/[slug]/page";
import { ResourceBody } from "@/components/resources/ResourceBody";
import NotFound from "@/app/not-found";

afterEach(() => {
  cleanup();
  state.docs = [];
});

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("/resources index", () => {
  it("renders a deliberate empty state (no placeholder copy) when nothing is published", () => {
    render(<ResourcesIndexPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Resources" })).toBeInTheDocument();
    expect(screen.getByText(/No guides are published yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/lorem|todo|placeholder|coming soon/i);
  });

  it("lists each published resource with title link, date, and summary", () => {
    state.docs = [fixture];
    render(<ResourcesIndexPage />);
    const link = screen.getByRole("link", { name: fixture.frontmatter.title });
    expect(link).toHaveAttribute("href", "/resources/profitable-but-short-on-cash");
    expect(screen.getByText("September 1, 2026").closest("time")).toHaveAttribute("dateTime", "2026-09-01");
    expect(screen.getByText(fixture.frontmatter.description)).toBeInTheDocument();
  });

  it("links to /resources from the shared public footer", () => {
    render(<ResourcesIndexPage />);
    const footerNav = screen.getByRole("navigation", { name: "Resources, legal, and support" });
    expect(within(footerNav).getByRole("link", { name: "Resources" })).toHaveAttribute("href", "/resources");
  });
});

describe("/resources/[slug]", () => {
  it("is statically generated only for visible resources; unknown slugs 404", async () => {
    state.docs = [fixture];
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual([{ slug: "profitable-but-short-on-cash" }]);
    await expect(ResourcePage(params("this-resource-does-not-exist-verification"))).rejects.toThrow();
    expect(await generateMetadata(params("nope"))).toEqual({});
  });

  it("renders the article with one H1, byline, dates, body, JSON-LD, and navigation back", async () => {
    state.docs = [fixture];
    const { container } = render(await ResourcePage(params("profitable-but-short-on-cash")));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(fixture.frontmatter.title);
    expect(screen.getByText(/By OpsIQ/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /All resources/ })[0]).toHaveAttribute("href", "/resources");
    expect(screen.getByRole("link", { name: "Back to OpsIQ" })).toHaveAttribute("href", "/");
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld.headline).toBe(fixture.frontmatter.title);
  });

  it("builds per-resource metadata for a valid slug", async () => {
    state.docs = [fixture];
    const meta = await generateMetadata(params("profitable-but-short-on-cash"));
    expect(meta.alternates?.canonical).toBe("https://opsiq.solutions/resources/profitable-but-short-on-cash");
  });

  it("offers the existing beta-access modal from the article (inline CTA + closing CTA + header)", async () => {
    state.docs = [fixture];
    render(await ResourcePage(params("profitable-but-short-on-cash")));
    const triggers = screen.getAllByRole("button", { name: "Request beta access" });
    expect(triggers).toHaveLength(3);
    fireEvent.click(triggers[1]);
    const dialog = screen.getByRole("dialog", { name: "Request beta access" });
    expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("labels a draft on preview builds", async () => {
    state.docs = [{ ...fixture, frontmatter: { ...fixture.frontmatter, status: "draft" } }];
    render(await ResourcePage(params("profitable-but-short-on-cash")));
    expect(screen.getByText(/Draft — not published/)).toBeInTheDocument();
  });
});

describe("ResourceBody renderer", () => {
  it("renders tables as captioned, focusable, labelled scroll regions with header semantics", () => {
    render(<ResourceBody blocks={fixture.blocks} />);
    const regions = screen.getAllByRole("region");
    expect(regions).toHaveLength(2);
    const [profit, cash] = regions;
    expect(profit).toHaveAccessibleName("Monthly profit");
    expect(cash).toHaveAccessibleName("Cash position for the next 30 days");
    expect(profit).toHaveAttribute("tabindex", "0");
    expect(profit.className).toContain("overflow-x-auto");
    const table = within(profit).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Line", "Amount", "Share of revenue"]);
    expect(within(table).getByRole("rowheader", { name: "Profit" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "$4,500" }).className).toContain("text-right");
  });

  it("renders headings with anchors, lists, checklist, callouts, quote, rule, and safe links", () => {
    const { container } = render(<ResourceBody blocks={fixture.blocks} />);
    expect(screen.getByRole("heading", { level: 2, name: "A worked example" })).toHaveAttribute("id", "a-worked-example");
    expect(screen.getByRole("heading", { level: 3, name: "What the example shows" })).toBeInTheDocument();
    expect(container.querySelector("ol")).not.toBeNull();
    const checklist = screen.getByRole("list", { name: "Checklist" });
    expect(within(checklist).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("complementary", { name: "Disclaimer" })).toHaveTextContent(/not financial, accounting, tax, or legal advice/);
    expect(screen.getByRole("complementary", { name: "Note" })).toBeInTheDocument();
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("hr")).not.toBeNull();
    expect(screen.getByText(/Figures are illustrative/).tagName).toBe("EM");
    const external = screen.getByRole("link", { name: /Small Business Administration/ });
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "resource library" })).toHaveAttribute("href", "/resources");
  });

  it("never renders raw HTML from content", () => {
    const { container } = render(
      <ResourceBody blocks={[{ type: "paragraph", children: [{ type: "text", value: "<img src=x onerror=alert(1)>" }] }]} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("404 page", () => {
  it("offers navigation back to public pages", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /homepage/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /resources/i })).toHaveAttribute("href", "/resources");
  });
});
