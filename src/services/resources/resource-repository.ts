/**
 * File-backed resource repository.
 *
 * Source of truth: every `<slug>.md` file in content/resources/. Adding a file is
 * the whole publishing step — the index page, the `/resources/<slug>` static
 * route, and sitemap.xml all derive from this one listing, so no route,
 * registry, or sitemap edit is ever needed per resource.
 *
 * Loading is all-or-nothing: any invalid file (bad filename, frontmatter,
 * body syntax, a future publish date, or a missing image) throws, which fails
 * `next build` and the content test suite rather than silently dropping or
 * mis-rendering an article in production.
 *
 * Read only at build time: the resource routes and sitemap.xml are statically
 * generated (`dynamicParams = false`), and no private data, session, or API is
 * involved. The fs calls therefore carry `turbopackIgnore` so output-file
 * tracing does not pull the whole project into server bundles.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ResourceContentError,
  collectResourceImagePaths,
  parseResourceDocument,
  type ResourceDocument,
} from "@/domain/resources/resource-content";

export const DEFAULT_RESOURCE_DIR = path.join(process.cwd(), "content", "resources");
export const DEFAULT_PUBLIC_DIR = path.join(process.cwd(), "public");

const RESOURCE_FILENAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export interface ResourceLoadOptions {
  resourceDir?: string;
  publicDir?: string;
  /** Build/reference "today"; a published resource may not carry a later publishedAt. */
  now?: Date;
}

/**
 * Drafts are never visible on the production deployment. They render (with
 * `noindex`) only on Vercel preview deployments, or on a local build started
 * with RESOURCES_INCLUDE_DRAFTS=true, so an article can be reviewed at its real
 * URL before it is published. Drafts never enter sitemap.xml in any environment.
 */
export function shouldIncludeDrafts(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.VERCEL_ENV === "preview" || env.RESOURCES_INCLUDE_DRAFTS === "true";
}

function assertImagesExist(doc: ResourceDocument, publicDir: string): void {
  for (const imagePath of collectResourceImagePaths(doc)) {
    const onDisk = path.join(/*turbopackIgnore: true*/ publicDir, ...imagePath.split("/").filter(Boolean));
    if (!fs.existsSync(/*turbopackIgnore: true*/ onDisk)) {
      throw new ResourceContentError(`image '${imagePath}' does not exist under public/`);
    }
  }
}

export function loadAllResources(options: ResourceLoadOptions = {}): ResourceDocument[] {
  const resourceDir = options.resourceDir ?? DEFAULT_RESOURCE_DIR;
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR;
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);

  if (!fs.existsSync(/*turbopackIgnore: true*/ resourceDir)) {
    throw new ResourceContentError(`resource directory '${resourceDir}' does not exist`);
  }

  const docs: ResourceDocument[] = [];
  const errors: string[] = [];

  for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ resourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const match = RESOURCE_FILENAME.exec(entry.name);
    if (!entry.isFile() || !match) {
      errors.push(`${entry.name}: resource files must be '<lowercase-kebab-slug>.md'`);
      continue;
    }
    try {
      const filePath = path.join(/*turbopackIgnore: true*/ resourceDir, entry.name);
      const doc = parseResourceDocument(match[1], fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf8"));
      if (doc.frontmatter.status === "published" && doc.frontmatter.publishedAt > today) {
        throw new ResourceContentError(`publishedAt ${doc.frontmatter.publishedAt} is in the future for a published resource`);
      }
      assertImagesExist(doc, publicDir);
      docs.push(doc);
    } catch (contentError) {
      // Collect this loader's own validation failures (authored, build-time messages) so one
      // build reports every broken file; anything unexpected (e.g. an I/O fault) propagates as-is.
      if (!(contentError instanceof ResourceContentError)) throw contentError;
      errors.push(`${entry.name}: ${contentError.message}`);
    }
  }

  if (errors.length > 0) {
    throw new ResourceContentError(`invalid resource content:\n  ${errors.join("\n  ")}`);
  }

  // Newest first; slug as a deterministic tiebreaker.
  return docs.sort(
    (a, b) =>
      b.frontmatter.publishedAt.localeCompare(a.frontmatter.publishedAt) || a.slug.localeCompare(b.slug)
  );
}

let cachedDefault: ResourceDocument[] | null = null;

function defaultResources(): ResourceDocument[] {
  if (!cachedDefault) cachedDefault = loadAllResources();
  return cachedDefault;
}

/** Resources that render as pages / appear on the index in this environment. */
export function listVisibleResources(
  resources: ResourceDocument[] = defaultResources(),
  includeDrafts: boolean = shouldIncludeDrafts()
): ResourceDocument[] {
  return resources.filter((doc) => doc.frontmatter.status === "published" || includeDrafts);
}

/** Resources eligible for search indexing (sitemap). Never includes drafts. */
export function listIndexableResources(resources: ResourceDocument[] = defaultResources()): ResourceDocument[] {
  return resources.filter((doc) => doc.frontmatter.status === "published");
}

export function getVisibleResource(
  slug: string,
  resources: ResourceDocument[] = defaultResources(),
  includeDrafts: boolean = shouldIncludeDrafts()
): ResourceDocument | null {
  return listVisibleResources(resources, includeDrafts).find((doc) => doc.slug === slug) ?? null;
}

/** The date search engines should treat as the resource's last meaningful change. */
export function resourceLastModified(doc: ResourceDocument): Date {
  return new Date(`${doc.frontmatter.updatedAt ?? doc.frontmatter.publishedAt}T00:00:00.000Z`);
}
