/**
 * File-backed resource repository (src/services/resources/resource-repository.ts):
 * directory discovery, all-or-nothing validation, draft visibility policy, and
 * the real content/resources directory validating cleanly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_RESOURCE_DIR,
  getVisibleResource,
  listIndexableResources,
  listVisibleResources,
  loadAllResources,
  resourceLastModified,
  shouldIncludeDrafts,
} from "@/services/resources/resource-repository";

const NOW = new Date("2026-09-24T12:00:00.000Z");

function resourceFile(fields: Record<string, string>, body = "Body paragraph."): string {
  const fm = {
    title: '"A valid resource title"',
    description: "A description that is comfortably longer than fifty characters in total.",
    publishedAt: "2026-09-01",
    author: "OpsIQ",
    authorType: "organization",
    status: "published",
    ...fields,
  };
  return ["---", ...Object.entries(fm).map(([k, v]) => `${k}: ${v}`), "---", body].join("\n");
}

let root: string;
let resourceDir: string;
let publicDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "opsiq-resources-"));
  resourceDir = path.join(root, "content", "resources");
  publicDir = path.join(root, "public");
  fs.mkdirSync(resourceDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, "resources"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(name: string, contents: string) {
  fs.writeFileSync(path.join(resourceDir, name), contents);
}

function load() {
  return loadAllResources({ resourceDir, publicDir, now: NOW });
}

describe("loadAllResources", () => {
  it("returns an empty list for an empty directory (ignoring dotfiles like .gitkeep)", () => {
    write(".gitkeep", "");
    expect(load()).toEqual([]);
  });

  it("derives the slug from the filename and sorts newest first, slug as tiebreaker", () => {
    write("older.md", resourceFile({ publishedAt: "2026-08-01" }));
    write("b-newer.md", resourceFile({ publishedAt: "2026-09-10" }));
    write("a-newer.md", resourceFile({ publishedAt: "2026-09-10" }));
    expect(load().map((d) => d.slug)).toEqual(["a-newer", "b-newer", "older"]);
  });

  it.each([
    ["an uppercase filename", "Bad-Name.md"],
    ["a non-.md file", "notes.txt"],
    ["an underscore slug", "bad_name.md"],
    ["an .mdx file", "article.mdx"],
  ])("fails the whole load for %s", (_label, name) => {
    write("good.md", resourceFile({}));
    write(name, resourceFile({}));
    expect(() => load()).toThrow(/resource files must be/);
  });

  it("fails for a subdirectory inside the content directory", () => {
    fs.mkdirSync(path.join(resourceDir, "nested"));
    expect(() => load()).toThrow(/nested: resource files must be/);
  });

  it("names every invalid file in one error", () => {
    write("one.md", resourceFile({ title: "short" }));
    write("two.md", resourceFile({}, "# H1 not allowed"));
    expect(() => load()).toThrow(/one\.md:.*\n.*two\.md:/s);
  });

  it("rejects a published resource dated in the future, but allows a future-dated draft", () => {
    write("future.md", resourceFile({ publishedAt: "2026-10-01" }));
    expect(() => load()).toThrow(/in the future/);
    write("future.md", resourceFile({ publishedAt: "2026-10-01", status: "draft" }));
    expect(load()).toHaveLength(1);
  });

  it("requires the social image and body images to exist under public/", () => {
    write(
      "with-image.md",
      resourceFile({ ogImage: "/resources/card.png", ogImageAlt: "A descriptive social card alt text" }, "![Chart of cash by week](/resources/chart.png)")
    );
    expect(() => load()).toThrow(/'\/resources\/card\.png' does not exist/);
    fs.writeFileSync(path.join(publicDir, "resources", "card.png"), "png");
    expect(() => load()).toThrow(/'\/resources\/chart\.png' does not exist/);
    fs.writeFileSync(path.join(publicDir, "resources", "chart.png"), "png");
    expect(load()[0].frontmatter.ogImage).toBe("/resources/card.png");
  });

  it("throws when the content directory is missing", () => {
    expect(() => loadAllResources({ resourceDir: path.join(root, "missing"), publicDir, now: NOW })).toThrow(/does not exist/);
  });
});

describe("draft visibility policy", () => {
  it.each([
    [{ VERCEL_ENV: "production" }, false],
    [{ VERCEL_ENV: "production", RESOURCES_INCLUDE_DRAFTS: "true" }, false],
    [{ VERCEL_ENV: "preview" }, true],
    [{ RESOURCES_INCLUDE_DRAFTS: "true" }, true],
    [{}, false],
    [{ VERCEL_ENV: "development" }, false],
  ])("env %j → include drafts: %s", (env, expected) => {
    expect(shouldIncludeDrafts(env)).toBe(expected);
  });

  it("hides drafts from visible pages unless included, and never indexes them", () => {
    write("live.md", resourceFile({}));
    write("wip.md", resourceFile({ status: "draft" }));
    const docs = load();
    expect(listVisibleResources(docs, false).map((d) => d.slug)).toEqual(["live"]);
    expect(listVisibleResources(docs, true).map((d) => d.slug).sort()).toEqual(["live", "wip"]);
    expect(listIndexableResources(docs).map((d) => d.slug)).toEqual(["live"]);
    expect(getVisibleResource("wip", docs, false)).toBeNull();
    expect(getVisibleResource("wip", docs, true)?.slug).toBe("wip");
    expect(getVisibleResource("does-not-exist", docs, true)).toBeNull();
  });
});

describe("resourceLastModified", () => {
  it("uses updatedAt when present, otherwise publishedAt — never the build time", () => {
    write("a.md", resourceFile({ updatedAt: "2026-09-15" }));
    write("b.md", resourceFile({}));
    const [a, b] = load();
    expect(resourceLastModified(a).toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(resourceLastModified(b).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("repository content (content/resources)", () => {
  it("every committed resource file validates (this is the pre-merge content gate)", () => {
    expect(() => loadAllResources({ resourceDir: DEFAULT_RESOURCE_DIR })).not.toThrow();
  });
});
