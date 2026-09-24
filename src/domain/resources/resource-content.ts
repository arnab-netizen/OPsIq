/**
 * Owned resource (long-form article) content model + strict Markdown-subset parser.
 *
 * One resource = one Markdown file in content/resources/<slug>.md with a small
 * frontmatter block. This module is pure (no fs, no React): it turns the file's
 * text into validated metadata and a typed block tree that the generic renderer
 * (src/components/resources/ResourceBody.tsx) turns into React elements. Nothing
 * here ever produces raw HTML, so article content can never inject markup.
 *
 * The parser is deliberately strict: anything outside the supported subset is a
 * ResourceContentError (with a line number) rather than being silently rendered
 * in some unintended way. The build and the content test suite load every
 * resource file, so an authoring mistake fails CI instead of reaching production.
 *
 * Supported body syntax (see docs/opsiq/resources/AUTHORING.md):
 *   ## / ###                  section headings (the H1 is the frontmatter title)
 *   paragraphs                consecutive lines, separated by a blank line
 *   **bold**  *italic*  `code`  [text](href)   inline formatting
 *   - item / 1. item          unordered / ordered lists (one line per item)
 *   - [ ] item / - [x] item   checklist
 *   Table: <caption>          caption line followed directly by a pipe table
 *   > quote                   blockquote
 *   :::note / :::disclaimer   callout blocks, closed by :::
 *   :::cta                    beta-access call to action (first line = heading)
 *   ![alt](/resources/x.png)  image on its own line (file under public/)
 *   ---                       horizontal rule
 */

import { z } from "zod/v4";

export const RESOURCE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ResourceContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceContentError";
  }
}

// ── Inline + block tree ──────────────────────────────────────────────────────

export type ResourceInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: ResourceInline[] }
  | { type: "em"; children: ResourceInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: ResourceInline[] };

export type TableAlign = "left" | "center" | "right" | null;

export type ResourceBlock =
  | { type: "heading"; level: 2 | 3; id: string; children: ResourceInline[] }
  | { type: "paragraph"; children: ResourceInline[] }
  | { type: "list"; ordered: false; items: ResourceInline[][] }
  | { type: "list"; ordered: true; start: number; items: ResourceInline[][] }
  | { type: "checklist"; items: Array<{ checked: boolean; children: ResourceInline[] }> }
  | {
      type: "table";
      caption: ResourceInline[];
      align: TableAlign[];
      header: ResourceInline[][];
      rows: ResourceInline[][][];
    }
  | { type: "blockquote"; children: ResourceBlock[] }
  | { type: "callout"; variant: "note" | "disclaimer"; children: ResourceBlock[] }
  | { type: "cta"; heading: ResourceInline[]; children: ResourceBlock[] }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" };

// ── Frontmatter ──────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const isoDateSchema = z.string().refine(isRealIsoDate, { message: "must be a real calendar date in YYYY-MM-DD form" });

/** Local image under public/resources/ (the only place resource images may live). */
export const RESOURCE_IMAGE_PATH_PATTERN = /^\/resources\/[a-z0-9]+(?:[-/][a-z0-9]+)*\.(?:png|jpg|jpeg|webp)$/;

export const resourceFrontmatterSchema = z
  .strictObject({
    title: z.string().trim().min(10).max(110),
    description: z.string().trim().min(50).max(200),
    publishedAt: isoDateSchema,
    updatedAt: isoDateSchema.optional(),
    author: z.string().trim().min(2).max(80),
    authorType: z.enum(["person", "organization"]),
    status: z.enum(["draft", "published"]),
    ogImage: z.string().regex(RESOURCE_IMAGE_PATH_PATTERN, "must be a /resources/*.png|jpg|jpeg|webp path").optional(),
    ogImageAlt: z.string().trim().min(10).max(300).optional(),
  })
  .refine((fm) => (fm.ogImage === undefined) === (fm.ogImageAlt === undefined), {
    message: "ogImage and ogImageAlt must be provided together",
    path: ["ogImageAlt"],
  })
  .refine((fm) => fm.updatedAt === undefined || fm.updatedAt >= fm.publishedAt, {
    message: "updatedAt must not be earlier than publishedAt",
    path: ["updatedAt"],
  });

export type ResourceFrontmatter = z.infer<typeof resourceFrontmatterSchema>;

export interface ResourceDocument {
  slug: string;
  frontmatter: ResourceFrontmatter;
  blocks: ResourceBlock[];
}

function splitFrontmatter(source: string): { frontmatterLines: string[]; body: string[]; bodyStartLine: number } {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new ResourceContentError("line 1: file must start with a '---' frontmatter block");
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new ResourceContentError("frontmatter block is not closed with '---'");
  }
  return { frontmatterLines: lines.slice(1, end), body: lines.slice(end + 1), bodyStartLine: end + 2 };
}

function parseFrontmatterLines(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  lines.forEach((raw, idx) => {
    const lineNo = idx + 2;
    if (raw.trim() === "") return;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(raw);
    if (!match) {
      throw new ResourceContentError(`line ${lineNo}: frontmatter lines must be 'key: value'`);
    }
    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new ResourceContentError(`line ${lineNo}: duplicate frontmatter key '${key}'`);
    }
    let value = rawValue.trim();
    if (value.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "string") throw new Error("not a string");
        value = parsed;
      } catch {
        throw new ResourceContentError(`line ${lineNo}: malformed quoted value for '${key}'`);
      }
    }
    out[key] = value;
  });
  return out;
}

/** Parse + validate one resource file. `slug` comes from its filename. */
export function parseResourceDocument(slug: string, source: string): ResourceDocument {
  if (!RESOURCE_SLUG_PATTERN.test(slug)) {
    throw new ResourceContentError(`slug '${slug}' must be lowercase kebab-case (a-z, 0-9, single hyphens)`);
  }
  const { frontmatterLines, body, bodyStartLine } = splitFrontmatter(source);
  const result = resourceFrontmatterSchema.safeParse(parseFrontmatterLines(frontmatterLines));
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
      .join("; ");
    throw new ResourceContentError(`invalid frontmatter: ${detail}`);
  }
  const blocks = parseResourceBody(body, bodyStartLine);
  if (blocks.length === 0) {
    throw new ResourceContentError("resource body is empty");
  }
  return { slug, frontmatter: result.data, blocks };
}

// ── Inline parsing ───────────────────────────────────────────────────────────

const ESCAPABLE = new Set(["\\", "*", "_", "`", "[", "]", "(", ")", "|", "!", "#", ">", "-", "+", ".", ":"]);

function fail(lineNo: number, message: string): never {
  throw new ResourceContentError(`line ${lineNo}: ${message}`);
}

/** Index of the closing `marker` starting at `from`, skipping escapes and code spans; -1 if none. */
function findClosing(text: string, from: number, marker: "*" | "**"): number {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      const close = text.indexOf("`", i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (marker === "**" && text.startsWith("**", i)) return i;
    if (marker === "*" && c === "*") {
      if (text.startsWith("**", i)) {
        // A nested **bold** run inside *italic*: jump past its closing marker.
        const inner = findClosing(text, i + 2, "**");
        if (inner === -1) return -1;
        i = inner + 2;
        continue;
      }
      return i;
    }
    i += 1;
  }
  return -1;
}

export function validateHref(href: string, lineNo: number): string {
  if (href.startsWith("#")) {
    if (!/^#[a-z0-9-]+$/.test(href)) fail(lineNo, `invalid in-page anchor '${href}'`);
    return href;
  }
  if (href.startsWith("/")) {
    if (href.startsWith("//") || /\s/.test(href)) fail(lineNo, `invalid internal link '${href}'`);
    return href;
  }
  if (href.startsWith("mailto:")) {
    if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) fail(lineNo, `invalid mailto link '${href}'`);
    return href;
  }
  if (href.startsWith("https://")) {
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" || !url.hostname.includes(".")) throw new Error("bad host");
    } catch {
      fail(lineNo, `invalid external link '${href}'`);
    }
    return href;
  }
  return fail(lineNo, `links must be https://, root-relative (/...), #anchor, or mailto: — got '${href}'`);
}

export function parseInline(text: string, lineNo: number, allowLinks = true): ResourceInline[] {
  const out: ResourceInline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", value: buf });
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === "\\") {
      const next = text[i + 1];
      if (next !== undefined && ESCAPABLE.has(next)) {
        buf += next;
        i += 2;
        continue;
      }
      fail(lineNo, `unsupported escape '\\${next ?? ""}'`);
    }

    if (c === "`") {
      const close = text.indexOf("`", i + 1);
      if (close === -1) fail(lineNo, "unclosed inline code (`)");
      const value = text.slice(i + 1, close);
      if (!value) fail(lineNo, "empty inline code");
      flush();
      out.push({ type: "code", value });
      i = close + 1;
      continue;
    }

    if (text.startsWith("**", i)) {
      const close = findClosing(text, i + 2, "**");
      if (close === -1) fail(lineNo, "unclosed bold (**)");
      const inner = text.slice(i + 2, close);
      if (!inner.trim()) fail(lineNo, "empty bold (****)");
      flush();
      out.push({ type: "strong", children: parseInline(inner, lineNo, allowLinks) });
      i = close + 2;
      continue;
    }

    if (c === "*") {
      const close = findClosing(text, i + 1, "*");
      if (close === -1) fail(lineNo, "unclosed italic (*) — escape a literal asterisk as \\*");
      const inner = text.slice(i + 1, close);
      if (!inner.trim()) fail(lineNo, "empty italic (**)");
      flush();
      out.push({ type: "em", children: parseInline(inner, lineNo, allowLinks) });
      i = close + 1;
      continue;
    }

    if (c === "[") {
      if (!allowLinks) fail(lineNo, "links cannot be nested inside link text");
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket === -1 || text[closeBracket + 1] !== "(") {
        fail(lineNo, "'[' must start a [text](href) link — escape a literal bracket as \\[");
      }
      const closeParen = text.indexOf(")", closeBracket + 2);
      if (closeParen === -1) fail(lineNo, "unclosed link href — missing ')'");
      const label = text.slice(i + 1, closeBracket);
      if (!label.trim()) fail(lineNo, "link text must not be empty");
      const href = validateHref(text.slice(closeBracket + 2, closeParen), lineNo);
      flush();
      out.push({ type: "link", href, children: parseInline(label, lineNo, false) });
      i = closeParen + 1;
      continue;
    }

    if (c === "]") fail(lineNo, "unmatched ']' — escape a literal bracket as \\]");

    buf += c;
    i += 1;
  }
  flush();
  return out;
}

export function inlineToPlainText(nodes: ResourceInline[]): string {
  return nodes
    .map((n) => (n.type === "text" || n.type === "code" ? n.value : inlineToPlainText(n.children)))
    .join("");
}

// ── Block parsing ────────────────────────────────────────────────────────────

const HEADING = /^(#{2,3}) (.+)$/;
const RULE = /^---$/;
const CONTAINER_OPEN = /^:::([a-z]+)$/;
const CONTAINER_CLOSE = ":::";
const TABLE_CAPTION = /^Table: (.+)$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const QUOTE = /^> ?(.*)$/;
const CHECK_ITEM = /^- \[( |x|X)\] (.+)$/;
const BULLET_ITEM = /^- (.+)$/;
const ORDERED_ITEM = /^(\d{1,3})\. (.+)$/;

function startsBlock(line: string): boolean {
  return (
    /^#{1,6} /.test(line) ||
    RULE.test(line) ||
    line.startsWith(":::") ||
    TABLE_CAPTION.test(line) ||
    line.startsWith("|") ||
    line.startsWith("![") ||
    line.startsWith(">") ||
    BULLET_ITEM.test(line) ||
    ORDERED_ITEM.test(line)
  );
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
  return slug || "section";
}

function splitTableRow(line: string, lineNo: number): string[] {
  if (!line.startsWith("|") || !line.endsWith("|") || line.length < 3) {
    fail(lineNo, "table rows must start and end with '|'");
  }
  const cells: string[] = [];
  let buf = "";
  const inner = line.slice(1, -1);
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === "\\" && inner[i + 1] === "|") {
      buf += "\\|";
      i += 1;
    } else if (c === "|") {
      cells.push(buf.trim());
      buf = "";
    } else {
      buf += c;
    }
  }
  cells.push(buf.trim());
  return cells;
}

interface BlockContext {
  headingIds: Map<string, number>;
  /** Container blocks (callout/cta) may only hold paragraphs, lists, and checklists. */
  inContainer: boolean;
}

function parseBlocks(lines: string[], firstLineNo: number, ctx: BlockContext): ResourceBlock[] {
  const blocks: ResourceBlock[] = [];
  let i = 0;
  const lineNo = (idx: number) => firstLineNo + idx;

  const restrict = (idx: number, what: string) => {
    if (ctx.inContainer) fail(lineNo(idx), `${what} is not allowed inside a ::: block`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (/^\s/.test(line)) fail(lineNo(i), "indented lines are not supported (nested lists/code blocks are not part of the resource format)");
    if (/\s$/.test(line)) fail(lineNo(i), "trailing whitespace is not allowed");
    if (line.startsWith("```")) fail(lineNo(i), "fenced code blocks are not supported");
    if (line.startsWith("<")) fail(lineNo(i), "raw HTML is not supported");

    if (line.startsWith("# ")) fail(lineNo(i), "H1 is reserved for the frontmatter title — use ## for sections");
    if (/^#{4,6} /.test(line)) fail(lineNo(i), "only ## and ### headings are supported");
    const heading = HEADING.exec(line);
    if (heading) {
      restrict(i, "a heading");
      const level = heading[1].length as 2 | 3;
      const children = parseInline(heading[2], lineNo(i));
      const base = slugifyHeading(inlineToPlainText(children));
      const seen = ctx.headingIds.get(base) ?? 0;
      ctx.headingIds.set(base, seen + 1);
      blocks.push({ type: "heading", level, id: seen === 0 ? base : `${base}-${seen + 1}`, children });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      restrict(i, "a horizontal rule");
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const container = CONTAINER_OPEN.exec(line);
    if (container) {
      restrict(i, "a nested ::: block");
      const name = container[1];
      if (name !== "note" && name !== "disclaimer" && name !== "cta") {
        fail(lineNo(i), `unknown block ':::${name}' (supported: :::note, :::disclaimer, :::cta)`);
      }
      const close = lines.indexOf(CONTAINER_CLOSE, i + 1);
      if (close === -1) fail(lineNo(i), `':::${name}' is not closed with ':::'`);
      const innerLines = lines.slice(i + 1, close);
      const innerCtx: BlockContext = { headingIds: ctx.headingIds, inContainer: true };
      if (name === "cta") {
        const headingIdx = innerLines.findIndex((l) => l.trim() !== "");
        if (headingIdx === -1) fail(lineNo(i), "':::cta' needs a heading line");
        const headingLine = innerLines[headingIdx];
        if (startsBlock(headingLine)) fail(lineNo(i + 1 + headingIdx), "':::cta' heading must be plain text");
        const children = parseBlocks(innerLines.slice(headingIdx + 1), lineNo(i + 2 + headingIdx), innerCtx);
        blocks.push({ type: "cta", heading: parseInline(headingLine, lineNo(i + 1 + headingIdx)), children });
      } else {
        const children = parseBlocks(innerLines, lineNo(i + 1), innerCtx);
        if (children.length === 0) fail(lineNo(i), `':::${name}' block is empty`);
        blocks.push({ type: "callout", variant: name, children });
      }
      i = close + 1;
      continue;
    }
    if (line === CONTAINER_CLOSE) fail(lineNo(i), "':::' without a matching opening block");

    const caption = TABLE_CAPTION.exec(line);
    if (caption) {
      restrict(i, "a table");
      const tableStart = i + 1;
      let end = tableStart;
      while (end < lines.length && lines[end].startsWith("|")) end += 1;
      if (end - tableStart < 3) {
        fail(lineNo(i), "a 'Table:' caption must be followed directly by a header row, a separator row, and at least one body row");
      }
      const header = splitTableRow(lines[tableStart], lineNo(tableStart));
      const separator = splitTableRow(lines[tableStart + 1], lineNo(tableStart + 1));
      if (separator.length !== header.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        fail(lineNo(tableStart + 1), "table separator row must be '| --- | ---: |' cells matching the header's column count");
      }
      const align: TableAlign[] = separator.map((cell) =>
        cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : null
      );
      const rows = lines.slice(tableStart + 2, end).map((rowLine, offset) => {
        const rowNo = lineNo(tableStart + 2 + offset);
        const cells = splitTableRow(rowLine, rowNo);
        if (cells.length !== header.length) {
          fail(rowNo, `table row has ${cells.length} cells but the header has ${header.length}`);
        }
        return cells.map((cell) => parseInline(cell, rowNo));
      });
      if (header.some((cell) => cell === "")) fail(lineNo(tableStart), "table header cells must not be empty");
      if (end < lines.length && lines[end].trim() !== "") fail(lineNo(end), "a table must be followed by a blank line");
      blocks.push({
        type: "table",
        caption: parseInline(caption[1], lineNo(i)),
        align,
        header: header.map((cell) => parseInline(cell, lineNo(tableStart))),
        rows,
      });
      i = end;
      continue;
    }
    if (line.startsWith("|")) fail(lineNo(i), "every table needs a 'Table: <caption>' line directly above it");

    if (line.startsWith("![")) {
      restrict(i, "an image");
      const image = IMAGE.exec(line);
      if (!image) fail(lineNo(i), "images must be a single line: ![alt text](/resources/file.png)");
      const [, alt, src] = image;
      if (alt.trim().length < 5) fail(lineNo(i), "image alt text must describe the image (at least 5 characters)");
      if (!RESOURCE_IMAGE_PATH_PATTERN.test(src)) fail(lineNo(i), `image src must be a /resources/*.png|jpg|jpeg|webp path — got '${src}'`);
      blocks.push({ type: "image", src, alt: alt.trim() });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      restrict(i, "a blockquote");
      const start = i;
      const inner: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        inner.push((QUOTE.exec(lines[i]) as RegExpExecArray)[1]);
        i += 1;
      }
      const children = parseBlocks(inner, lineNo(start), { headingIds: ctx.headingIds, inContainer: true });
      if (children.length === 0) fail(lineNo(start), "empty blockquote");
      blocks.push({ type: "blockquote", children });
      continue;
    }

    if (CHECK_ITEM.test(line)) {
      const items: Array<{ checked: boolean; children: ResourceInline[] }> = [];
      while (i < lines.length && lines[i].trim() !== "") {
        const item = CHECK_ITEM.exec(lines[i]);
        if (!item) fail(lineNo(i), "every line in a checklist must be '- [ ] item' or '- [x] item' (end the list with a blank line)");
        items.push({ checked: item[1] !== " ", children: parseInline(item[2], lineNo(i)) });
        i += 1;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    if (BULLET_ITEM.test(line)) {
      const items: ResourceInline[][] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        if (CHECK_ITEM.test(lines[i])) fail(lineNo(i), "do not mix checklist items into a bullet list");
        const item = BULLET_ITEM.exec(lines[i]);
        if (!item) fail(lineNo(i), "every line in a bullet list must start with '- ' (end the list with a blank line)");
        items.push(parseInline(item[1], lineNo(i)));
        i += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    const firstOrdered = ORDERED_ITEM.exec(line);
    if (firstOrdered) {
      const start = Number(firstOrdered[1]);
      const items: ResourceInline[][] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        const item = ORDERED_ITEM.exec(lines[i]);
        if (!item) fail(lineNo(i), "every line in a numbered list must start with 'N. ' (end the list with a blank line)");
        if (Number(item[1]) !== start + items.length) fail(lineNo(i), "numbered list items must be consecutive");
        items.push(parseInline(item[2], lineNo(i)));
        i += 1;
      }
      blocks.push({ type: "list", ordered: true, start, items });
      continue;
    }

    // Paragraph: consecutive non-blank lines. A block-starting line inside a
    // paragraph is an authoring error (it would be silently swallowed as text).
    const start = i;
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      if (i > start && startsBlock(lines[i])) {
        fail(lineNo(i), "separate this block from the paragraph above with a blank line");
      }
      if (/\s$/.test(lines[i])) fail(lineNo(i), "trailing whitespace is not allowed");
      parts.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(parts.join(" "), lineNo(start)) });
  }

  return blocks;
}

export function parseResourceBody(lines: string[], firstLineNo = 1): ResourceBlock[] {
  return parseBlocks(lines, firstLineNo, { headingIds: new Map(), inContainer: false });
}

/** Every local image path a document references (body images + social image). */
export function collectResourceImagePaths(doc: ResourceDocument): string[] {
  const paths = new Set<string>();
  if (doc.frontmatter.ogImage) paths.add(doc.frontmatter.ogImage);
  const walk = (blocks: ResourceBlock[]) => {
    for (const block of blocks) {
      if (block.type === "image") paths.add(block.src);
      if (block.type === "blockquote" || block.type === "callout" || block.type === "cta") walk(block.children);
    }
  };
  walk(doc.blocks);
  return [...paths];
}
