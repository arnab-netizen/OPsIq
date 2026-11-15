/**
 * The published Resource #1 article must keep a contextual link to the free
 * profit margin calculator, so readers of the guide can reach the tool.
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

describe("Resource #1 internal link to the calculator", () => {
  it("links to /tools/profit-margin-calculator exactly once", () => {
    const doc = loadAllResources().find((d) => d.slug === "profitable-but-short-on-cash");
    expect(doc).toBeDefined();
    const hrefs = doc!.blocks.flatMap(blockLinks);
    expect(hrefs.filter((h) => h === "/tools/profit-margin-calculator")).toHaveLength(1);
  });
});
