/**
 * Resource content model + strict Markdown-subset parser
 * (src/domain/resources/resource-content.ts).
 *
 * Includes the Resource #1 ingestion dry run: fixtures/resource-1-structure.md
 * reproduces every structure the frozen "Profitable but Short on Cash?"
 * article needs (sections, prose, bullets, checklist, two financial tables,
 * italic note, disclaimer, CTA, source links, metadata, social image). It is a
 * structural fixture, not the frozen article text, and lives outside
 * content/resources so it is never published.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ResourceContentError,
  collectResourceImagePaths,
  inlineToPlainText,
  parseInline,
  parseResourceBody,
  parseResourceDocument,
  type ResourceBlock,
} from "@/domain/resources/resource-content";

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "resource-1-structure.md"), "utf8");

const FRONTMATTER = [
  "---",
  'title: "A valid resource title"',
  "description: A description that is comfortably longer than fifty characters in total.",
  "publishedAt: 2026-09-01",
  "author: OpsIQ",
  "authorType: organization",
  "status: published",
  "---",
];

function doc(body: string, frontmatter: string[] = FRONTMATTER) {
  return parseResourceDocument("valid-slug", [...frontmatter, body].join("\n"));
}

function body(text: string): ResourceBlock[] {
  return parseResourceBody(text.split("\n"));
}

function withFrontmatter(overrides: Record<string, string | null>): string[] {
  const lines = FRONTMATTER.slice(1, -1).filter((line) => {
    const key = line.split(":")[0];
    return !(key in overrides) || overrides[key] !== null;
  });
  const mapped = lines.map((line) => {
    const key = line.split(":")[0];
    return key in overrides && overrides[key] !== null ? `${key}: ${overrides[key]}` : line;
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== null && !lines.some((l) => l.startsWith(`${key}:`))) mapped.push(`${key}: ${value}`);
  }
  return ["---", ...mapped, "---"];
}

describe("Resource #1 ingestion dry run (structural fixture)", () => {
  const parsed = parseResourceDocument("profitable-but-short-on-cash", FIXTURE);
  const types = parsed.blocks.map((b) => b.type);

  it("parses metadata including the per-resource social image", () => {
    expect(parsed.frontmatter.title).toBe("Profitable but Short on Cash? How to Tell Which Problem You Actually Have");
    expect(parsed.frontmatter.ogImage).toBe("/resources/profitable-but-short-on-cash.png");
    expect(parsed.frontmatter.ogImageAlt).toMatch(/\$4,500.*16%.*\$7,000.*\$5,000/);
    expect(collectResourceImagePaths(parsed)).toEqual(["/resources/profitable-but-short-on-cash.png"]);
  });

  it("supports every required structure with no bespoke code", () => {
    for (const t of ["paragraph", "heading", "list", "checklist", "table", "blockquote", "callout", "cta", "rule"]) {
      expect(types).toContain(t);
    }
    const headings = parsed.blocks.filter((b) => b.type === "heading");
    expect(headings.map((h) => h.level)).toEqual([2, 2, 3, 2, 2]);
  });

  it("parses both financial tables with captions, alignment, and matching cells", () => {
    const tables = parsed.blocks.filter((b): b is Extract<ResourceBlock, { type: "table" }> => b.type === "table");
    expect(tables).toHaveLength(2);
    expect(inlineToPlainText(tables[0].caption)).toBe("Monthly profit");
    expect(tables[0].align).toEqual([null, "right", "right"]);
    expect(tables[0].rows.map((r) => r.map(inlineToPlainText))).toContainEqual(["Profit", "$4,500", "16%"]);
    expect(tables[1].rows.map((r) => r.map(inlineToPlainText))).toContainEqual(["Current cash gap", "$5,000"]);
  });

  it("keeps the italic explanatory note, disclaimer, CTA, ordered list, and source links", () => {
    expect(parsed.blocks).toContainEqual({
      type: "paragraph",
      children: [{ type: "em", children: [{ type: "text", value: "Figures are illustrative. Your own margin and payment timing will differ." }] }],
    });
    const disclaimer = parsed.blocks.find((b) => b.type === "callout" && b.variant === "disclaimer");
    expect(disclaimer).toBeDefined();
    const cta = parsed.blocks.find((b): b is Extract<ResourceBlock, { type: "cta" }> => b.type === "cta");
    expect(inlineToPlainText(cta!.heading)).toBe("Want OpsIQ to watch this for you?");
    const ordered = parsed.blocks.find((b) => b.type === "list" && b.ordered);
    expect(ordered).toMatchObject({ start: 1 });
    const last = parsed.blocks[parsed.blocks.length - 1];
    expect(last.type).toBe("paragraph");
    const links = (last as Extract<ResourceBlock, { type: "paragraph" }>).children.filter((n) => n.type === "link");
    expect(links.map((l) => (l as { href: string }).href)).toEqual([
      "https://www.sba.gov/business-guide/manage-your-business/manage-your-finances",
      "/resources",
    ]);
  });

  it("marks checklist state", () => {
    const checklist = parsed.blocks.find((b): b is Extract<ResourceBlock, { type: "checklist" }> => b.type === "checklist");
    expect(checklist!.items.map((i) => i.checked)).toEqual([false, false, false, true]);
  });
});

describe("inline formatting", () => {
  it("parses bold, italic, nested emphasis, code, and links", () => {
    expect(parseInline("a **b** *c* `d` [e](/f)", 1)).toEqual([
      { type: "text", value: "a " },
      { type: "strong", children: [{ type: "text", value: "b" }] },
      { type: "text", value: " " },
      { type: "em", children: [{ type: "text", value: "c" }] },
      { type: "text", value: " " },
      { type: "code", value: "d" },
      { type: "text", value: " " },
      { type: "link", href: "/f", children: [{ type: "text", value: "e" }] },
    ]);
    expect(parseInline("*x **y** z*", 1)).toEqual([
      {
        type: "em",
        children: [
          { type: "text", value: "x " },
          { type: "strong", children: [{ type: "text", value: "y" }] },
          { type: "text", value: " z" },
        ],
      },
    ]);
  });

  it("honours escapes for literal markers", () => {
    expect(inlineToPlainText(parseInline("5 \\* 3 \\[a\\]", 1))).toBe("5 * 3 [a]");
  });

  it.each([
    ["unclosed bold", "a **b"],
    ["unclosed italic", "a *b"],
    ["stray bracket", "a [b"],
    ["unmatched close bracket", "a ] b"],
    ["javascript: link", "[x](javascript:alert(1))"],
    ["http link", "[x](http://example.com)"],
    ["protocol-relative link", "[x](//evil.example)"],
    ["nested link", "[a [b](/c)](/d)"],
    ["empty link text", "[](/a)"],
  ])("rejects %s", (_label, text) => {
    expect(() => parseInline(text, 1)).toThrow(ResourceContentError);
  });
});

describe("block syntax is strict", () => {
  it.each([
    ["an H1 in the body", "# Title"],
    ["an H4", "#### Deep"],
    ["indented content", "  - nested"],
    ["raw HTML", "<script>alert(1)</script>"],
    ["fenced code", "```\ncode\n```"],
    ["a table without a caption", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
    ["a table row with the wrong cell count", "Table: T\n| a | b |\n| --- | --- |\n| 1 |"],
    ["a table with a bad separator", "Table: T\n| a | b |\n| - | - |\n| 1 | 2 |"],
    ["a table with no body rows", "Table: T\n| a | b |\n| --- | --- |"],
    ["an unknown ::: block", ":::warning\nx\n:::"],
    ["an unclosed ::: block", ":::note\nx"],
    ["a nested ::: block", ":::note\n:::cta\nx\n:::\n:::"],
    ["a heading inside a callout", ":::note\n## Heading\n:::"],
    ["an image outside public/resources", "![A descriptive alt](https://cdn.example/x.png)"],
    ["an image without meaningful alt text", "![](/resources/x.png)"],
    ["a list glued to a paragraph", "Intro text\n- item"],
    ["mixed checklist and bullets", "- [ ] a\n- b"],
    ["non-consecutive numbering", "1. a\n3. b"],
    ["trailing whitespace", "Hello "],
  ])("rejects %s", (_label, text) => {
    expect(() => body(text)).toThrow(ResourceContentError);
  });

  it("reports the offending line number", () => {
    expect(() => doc("Fine paragraph.\n\n# Not allowed")).toThrow(/line 11/);
  });

  it("de-duplicates heading anchors", () => {
    const blocks = body("## Cash\n\n## Cash");
    expect(blocks.map((b) => (b as { id: string }).id)).toEqual(["cash", "cash-2"]);
  });

  it("renders an image block for a public/resources image with alt text", () => {
    expect(body("![Chart of monthly cash](/resources/chart.png)")).toEqual([
      { type: "image", src: "/resources/chart.png", alt: "Chart of monthly cash" },
    ]);
  });
});

describe("frontmatter validation", () => {
  it("accepts a minimal valid document", () => {
    expect(doc("Body.").frontmatter).toMatchObject({ status: "published", authorType: "organization" });
  });

  it.each([
    ["a missing title", { title: null }],
    ["a missing description", { description: null }],
    ["a missing publishedAt", { publishedAt: null }],
    ["a missing author", { author: null }],
    ["an impossible date", { publishedAt: "2026-02-30" }],
    ["a non-ISO date", { publishedAt: "Sept 1 2026" }],
    ["updatedAt before publishedAt", { updatedAt: "2026-08-01" }],
    ["an unknown key", { category: "cash" }],
    ["an unknown status", { status: "live" }],
    ["an ogImage without alt text", { ogImage: "/resources/x.png" }],
    ["an ogImage outside public/resources", { ogImage: "/og-image.png", ogImageAlt: "A long enough alt text" }],
    ["a too-short description", { description: "Too short." }],
    ["an over-long title", { title: `"${"T".repeat(111)}"` }],
  ])("rejects %s", (_label, overrides) => {
    expect(() => doc("Body.", withFrontmatter(overrides))).toThrow(ResourceContentError);
  });

  it("rejects duplicate frontmatter keys", () => {
    const fm = [...FRONTMATTER.slice(0, -1), "status: draft", "---"];
    expect(() => doc("Body.", fm)).toThrow(/duplicate frontmatter key 'status'/);
  });

  it("rejects a file without frontmatter, an empty body, and a non-kebab slug", () => {
    expect(() => parseResourceDocument("valid-slug", "No frontmatter")).toThrow(ResourceContentError);
    expect(() => doc("")).toThrow(/body is empty/);
    expect(() => parseResourceDocument("Bad_Slug", [...FRONTMATTER, "Body."].join("\n"))).toThrow(/kebab-case/);
  });
});
