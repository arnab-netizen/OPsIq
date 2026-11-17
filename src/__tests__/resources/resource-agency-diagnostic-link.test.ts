/**
 * The "Which Agency Number Should You Fix First?" article is the resource whose
 * topic and title most directly match the /agency Decision Diagnostic page. It
 * must keep a contextual link to that page so readers can reach the tool,
 * mirroring the existing /tools/profit-margin-calculator link convention (see
 * resource-1-calculator-link.test.ts).
 */

import { describe, it, expect } from "vitest";
import { loadAllResources } from "@/services/resources/resource-repository";
import type { ResourceBlock, ResourceInline } from "@/domain/resources/resource-content";

function linkHrefs(nodes: ResourceInline[]): string[] {
  return nodes.flatMap((n) => {
    if (n.type === "link") return [n.href];
    if (n.type === "strong" || n.type === "em") return linkHrefs(n.children);
    return [];
  });
}

function blockLinks(block: ResourceBlock): string[] {
  if (block.type === "paragraph" || block.type === "heading") return linkHrefs(block.children);
  if (block.type === "list") return block.items.flatMap(linkHrefs);
  return [];
}

describe("Resource 'which-agency-number-to-fix-first' internal link to the agency diagnostic", () => {
  it("links to /agency exactly once", () => {
    const doc = loadAllResources().find((d) => d.slug === "which-agency-number-to-fix-first");
    expect(doc).toBeDefined();
    const hrefs = doc!.blocks.flatMap(blockLinks);
    expect(hrefs.filter((h) => h === "/agency")).toHaveLength(1);
  });
});
