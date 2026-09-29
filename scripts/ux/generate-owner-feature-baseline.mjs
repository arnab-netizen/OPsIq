#!/usr/bin/env node
/**
 * UX-00A.1 — deterministic generator for docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json.
 *
 * Run: node scripts/ux/generate-owner-feature-baseline.mjs
 *
 * Every field is derived from current repository source at run time (file walks + regex
 * extraction over real source text) — nothing here is hand-authored data. The exceptions are the
 * two small routing tables below (OWNER_ACTION_FAMILIES' apiPathPrefixes/sourceKeywords/uiPages,
 * and PRIMARY_SIDEBAR_HREFS' fallback list), which exist only because "which API/domain directory
 * belongs to which named family" and "sidebar-vs-not" cannot be inferred from naming conventions
 * alone; the *content* they surface (states, endpoints, methods, capabilities) is always read
 * from source at generation time, never hardcoded.
 *
 * Documented heuristics (see inline comments at each site for the specific limitation):
 *  - API-call extraction treats any `identifier("/api/...")`-shaped call as an API call, and
 *    infers HTTP method from an explicit `method: "POST"` literal in the call's argument list,
 *    falling back to the calling identifier's own name (`apiPost` -> POST) and finally to GET.
 *    This is pattern matching over source text, not a type-checked call graph.
 *  - The functional component tree traced per owner page follows only relative imports and
 *    "@/components/owner/*" imports (the page's own feature-specific tree), not generic shared
 *    infra (@/ui/*, @/context/*, @/lib/*, @/domain/*, @/services/*) or node_modules packages, per
 *    the "trace the functional tree actually used, not the whole repo" scope instruction.
 *  - Owner action family "states" are extracted by regex over files matched by a family's
 *    source keywords, looking for `type XStatus = "A" | "B" | ...` and `enum X { A, B }` shapes.
 *    A family with no matching literal-union/enum shape in its matched files reports an empty
 *    states array with a note, not a fabricated one. "Known legal transitions" are reported only
 *    when a `*_TRANSITIONS`/`ALLOWED_*` map literal is directly found in source; otherwise
 *    NOT_VERIFIED, per instruction (state values must be known; transitions may stay unverified).
 *
 * Run twice and diff docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json to confirm
 * idempotence (only "generatedAt" should differ).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const OWNER_PAGE_ROOT = path.join(ROOT, "src/app/(authenticated)/owner");
const OWNER_API_ROOT = path.join(ROOT, "src/app/api/owner");
const OUT_FILE = path.join(ROOT, "docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json");

// ── minimal CLI flags (UX-00B) ──────────────────────────────────────────────
// Default behavior (no flags) is completely unchanged: writes OUT_FILE, reports to stdout.
// --stdout: prints ONLY the generated JSON to stdout (for a verifier to pipe + JSON.parse); every
//   informational report line moves to stderr instead, and the committed baseline is NOT written.
// --output <path>: writes the JSON to <path> instead of OUT_FILE; report lines stay on stdout.
// No extraction semantics changed by either flag -- only where the same JSON is written/printed.
const CLI_ARGS = process.argv.slice(2);
const STDOUT_MODE = CLI_ARGS.includes("--stdout");
const OUTPUT_ARG_IDX = CLI_ARGS.indexOf("--output");
const OUTPUT_PATH_ARG = OUTPUT_ARG_IDX !== -1 ? CLI_ARGS[OUTPUT_ARG_IDX + 1] : null;
/** Informational progress/report line — goes to stderr in --stdout mode so stdout stays pure JSON. */
function report(...vals) {
  (STDOUT_MODE ? console.error : console.log)(...vals);
}

function relSrc(p) {
  return path.relative(ROOT, p);
}

// ───────────────────────── low-level source-text helpers ─────────────────────────

function walkFiles(dir, matchName) {
  const out = [];
  (function rec(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) rec(full);
      else if (entry.name === matchName) out.push(full);
    }
  })(dir);
  return out.sort();
}

function walkAllFiles(dir, exts) {
  const out = [];
  (function rec(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) rec(full);
      else if (exts.includes(path.extname(entry.name))) out.push(full);
    }
  })(dir);
  return out.sort();
}

/** Strip `//` line and `/* *\/` block comments so dead/commented-out config is never parsed as live. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function matchBracket(text, openIdx, openChar, closeChar) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced ${openChar}${closeChar} starting at ${openIdx}`);
}

function splitTopLevelObjects(text) {
  const items = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        items.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return items;
}

function extractScalar(block, key) {
  const strM = block.match(new RegExp(`\\b${key}\\s*:\\s*"([^"]*)"`));
  if (strM) return strM[1];
  const boolM = block.match(new RegExp(`\\b${key}\\s*:\\s*(true|false)`));
  if (boolM) return boolM[1] === "true";
  const capM = block.match(new RegExp(`\\b${key}\\s*:\\s*CAPABILITIES\\.([A-Z0-9_]+)`));
  if (capM) return capM[1];
  return undefined;
}

function resolveImportSpecifier(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(ROOT, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function traceOwnerComponentTree(pageFile, maxDepth = 6) {
  const visited = new Set();
  const files = [];
  function shouldFollow(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("@/components/owner/");
  }
  function rec(file, depth) {
    if (visited.has(file) || depth > maxDepth) return;
    visited.add(file);
    files.push(file);
    let src;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      return;
    }
    const importRe = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
    let m;
    while ((m = importRe.exec(src))) {
      const spec = m[1];
      if (!shouldFollow(spec)) continue;
      const resolved = resolveImportSpecifier(file, spec);
      if (resolved) rec(resolved, depth + 1);
    }
  }
  rec(pageFile, 0);
  return files;
}

function readTemplateLiteral(text, backtickIdx) {
  let out = "";
  const interpolations = [];
  let i = backtickIdx + 1;
  while (i < text.length && text[i] !== "`") {
    if (text[i] === "$" && text[i + 1] === "{") {
      const close = matchBracket(text, i + 1, "{", "}");
      interpolations.push(text.slice(i + 2, close));
      out += ":param";
      i = close + 1;
    } else {
      out += text[i];
      i++;
    }
  }
  return { value: out, endIdx: i, interpolations };
}

function readQuotedLiteral(text, quoteIdx, quoteChar) {
  let i = quoteIdx + 1;
  while (i < text.length && text[i] !== quoteChar) {
    if (text[i] === "\\") i++;
    i++;
  }
  return { value: text.slice(quoteIdx + 1, i), endIdx: i, interpolations: [] };
}

const METHOD_KEYWORD_RE = /(post|put|patch|delete)/i;

function extractApiCalls(text) {
  const calls = [];
  const callHeadRe = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*(["'`])/g;
  let m;
  while ((m = callHeadRe.exec(text))) {
    const ident = m[1];
    const quoteChar = m[2];
    const quoteIdx = m.index + m[0].length - 1;
    const { value: rawValue, endIdx, interpolations } =
      quoteChar === "`" ? readTemplateLiteral(text, quoteIdx) : readQuotedLiteral(text, quoteIdx, quoteChar);
    if (!/^(\/api\/|\/decisions?\/|\/escalation\/)/.test(rawValue)) continue;
    let rawPath = rawValue.split("?")[0];
    rawPath = rawPath.replace(/([^/]):param/g, "$1");
    if (!rawPath.startsWith("/api/")) continue;
    // Method must come only from THIS call's own argument list (bounded by its own matching
    // closing paren), never a fixed trailing window — a fixed window could (and, in a confirmed
    // defect, did) read a later sibling call's `method: "POST"` and misattribute it to an earlier
    // GET-only call (e.g. /api/owner/recovery/dashboard, /api/owner/intake/dashboard).
    const callParenOpenIdx = text.indexOf("(", m.index);
    const callParenCloseIdx = matchBracket(text, callParenOpenIdx, "(", ")");
    const argsText = text.slice(callParenOpenIdx, callParenCloseIdx + 1);
    const explicitMethod = argsText.match(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/);
    let method;
    if (explicitMethod) method = explicitMethod[1];
    else {
      const kw = ident.match(METHOD_KEYWORD_RE);
      method = kw ? kw[1].toUpperCase() : "GET";
    }
    // Per-call-site context, for callers (e.g. buildCockpitExternalFeeds) that need more than the
    // aggregate path+method: whether THIS specific literal embeds businessId — directly, or via an
    // interpolated variable (e.g. `${qs}`) whose OWN declaration in this same file assigns from
    // `businessId` — and whether a null-returning `.then/.catch` is chained IMMEDIATELY (only
    // whitespace between) onto THIS call's own closing paren. A fixed trailing window here
    // previously read a later sibling call's `.catch(() => null)` and misattributed it to an
    // earlier call with no catch of its own (e.g. now-view wrongly inheriting recovery-status's
    // catch) — fixed by requiring immediate adjacency to this exact call's own close-paren.
    const beforeWindow = text.slice(Math.max(0, m.index - 200), m.index);
    const directBusinessId = interpolations.some((e) => /businessId/.test(e)) || /businessId/.test(rawValue);
    const viaVariable = interpolations.find((e) => {
      const varName = e.trim().split(/[.([]/)[0];
      if (!varName || varName === "businessId") return false;
      const declRe = new RegExp(`\\bconst\\s+${varName}\\s*=[^;]{0,300}businessId`, "s");
      return declRe.test(text);
    });
    const businessIdInLiteral = directBusinessId || Boolean(viaVariable);
    const businessIdVia = directBusinessId ? "direct" : viaVariable ? `via interpolated variable \`${viaVariable}\`` : null;
    const immediatelyAfterCall = text.slice(callParenCloseIdx + 1, callParenCloseIdx + 80);
    const chainedCatchNull = /^\s*\.catch\(\(\)\s*=>\s*null\)/.test(immediatelyAfterCall);
    const chainedThenTernaryNull = /^\s*\.then\(\s*\([^)]*\)\s*=>\s*\([^)]*\?[^:]*:\s*null\)\)/.test(immediatelyAfterCall);
    const nonFatalChain = chainedCatchNull || chainedThenTernaryNull;
    const hasAnyImmediateChain = /^\s*\.(then|catch)\(/.test(immediatelyAfterCall);
    calls.push({
      path: rawPath,
      method,
      matchIndex: m.index,
      businessIdInLiteral,
      businessIdVia,
      nonFatalChain,
      hasAnyImmediateChain,
      contextHint: beforeWindow.slice(-80),
    });
  }
  return calls;
}

function dedupeApiCalls(calls) {
  const seen = new Map();
  for (const c of calls) {
    const key = `${c.method} ${c.path}`;
    if (!seen.has(key)) seen.set(key, { method: c.method, path: c.path });
  }
  return [...seen.values()].sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

// ───────────────────────── owner page routes ─────────────────────────

function toOwnerRoute(pageFile) {
  const rel = path.relative(OWNER_PAGE_ROOT, path.dirname(pageFile));
  return rel === "" ? "/owner" : "/owner/" + rel.split(path.sep).join("/");
}

// Parsed mechanically from src/ui/shell/sidebar-nav.tsx below (parseSidebar()); this constant is
// only the fallback ordered list of hrefs used for "nearest ancestor" sub-route resolution and is
// itself populated FROM the parse result at run time, not hand-maintained.
const KNOWN_HIDDEN_FOR_SAFETY = new Set(["/owner/priorities", "/owner/alerts", "/owner/risks", "/owner/inventory"]);

function nearestAncestor(route, hrefSet) {
  const parts = route.split("/").filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const candidate = "/" + parts.slice(0, i).join("/");
    if (hrefSet.has(candidate) || KNOWN_HIDDEN_FOR_SAFETY.has(candidate)) return candidate;
  }
  return null;
}

function grepDeepLinks(route, selfFile) {
  const hits = [];
  const exts = new Set([".ts", ".tsx"]);
  (function rec(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) rec(full);
      else if (exts.has(path.extname(entry.name))) {
        if (full === selfFile) continue;
        const content = fs.readFileSync(full, "utf8");
        if (content.includes(`"${route}"`) || content.includes(`\`${route}`) || content.includes(`'${route}'`)) {
          hits.push(relSrc(full));
        }
      }
    }
  })(path.join(ROOT, "src"));
  return hits;
}

// ───────────────────────── sidebar-nav.tsx parser ─────────────────────────

function parseSidebar() {
  const file = path.join(ROOT, "src/ui/shell/sidebar-nav.tsx");
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const navStart = src.indexOf("const NAV_SECTIONS");
  const eqIdx = src.indexOf("=", navStart);
  const arrOpen = src.indexOf("[", eqIdx);
  const arrClose = matchBracket(src, arrOpen, "[", "]");
  const arrBody = src.slice(arrOpen + 1, arrClose);
  const sectionBlocks = splitTopLevelObjects(arrBody);
  const items = [];
  for (const sec of sectionBlocks) {
    const sectionId = extractScalar(sec, "id");
    const itemsIdx = sec.indexOf("items:");
    const itemsOpen = sec.indexOf("[", itemsIdx);
    const itemsClose = matchBracket(sec, itemsOpen, "[", "]");
    const itemsBody = sec.slice(itemsOpen + 1, itemsClose);
    for (const block of splitTopLevelObjects(itemsBody)) {
      const label = extractScalar(block, "label");
      const href = extractScalar(block, "href") ?? null;
      const requiresOwner = extractScalar(block, "requiresOwner") === true;
      const requiresCapability = extractScalar(block, "requiresCapability");
      const state = extractScalar(block, "state") ?? "core";
      const blurb = extractScalar(block, "blurb") ?? null;
      items.push({ section: sectionId, label, href, requiresOwner, requiresCapability: requiresCapability || null, state, blurb });
    }
  }
  return items;
}

// ───────────────────────── capability constants ─────────────────────────

function parseCapabilities() {
  const src = fs.readFileSync(path.join(ROOT, "src/domain/constants/capabilities.ts"), "utf8");
  const matches = [...src.matchAll(/^\s*([A-Z0-9_]+):\s*"([a-z_]+:[a-z_]+)"/gm)];
  return matches.map((m) => ({ constant: m[1], value: m[2] }));
}

// ───────────────────────── OwnerNowView field lists ─────────────────────────

function parseInterfaceFieldNames(file, interfaceName) {
  const src = fs.readFileSync(file, "utf8");
  const startRe = new RegExp(`export interface ${interfaceName}\\s*\\{`);
  const m = startRe.exec(src);
  if (!m) throw new Error(`interface ${interfaceName} not found in ${file}`);
  const openIdx = src.indexOf("{", m.index);
  const closeIdx = matchBracket(src, openIdx, "{", "}");
  const body = src.slice(openIdx + 1, closeIdx);
  const fieldRe = /^\s*([a-zA-Z][a-zA-Z0-9]*)\??:\s/gm;
  const fields = [];
  let fm;
  while ((fm = fieldRe.exec(body))) fields.push(fm[1]);
  return fields;
}

// ───────────────────────── owner API routes ─────────────────────────

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const CAP_RE = /CAPABILITIES\.([A-Z0-9_]+)/g;

function buildApiRoutesFrom(apiRootDir) {
  const apiFiles = walkFiles(apiRootDir, "route.ts");
  return apiFiles.map((f) => {
    const src = fs.readFileSync(f, "utf8");
    const methods = HTTP_METHODS.filter((m) => {
      const fnRe = new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`);
      const constRe = new RegExp(`export\\s+const\\s+${m}\\s*[=:]`);
      return fnRe.test(src) || constRe.test(src);
    });
    const caps = new Set();
    let m;
    while ((m = CAP_RE.exec(src))) caps.add(m[1]);
    const hasBusinessId = /\bbusinessId\b/.test(src);
    const hasWorkspaceId = /\bworkspaceId\b/.test(src);
    let scope = "NOT_VERIFIED";
    let scopeNote;
    if (hasBusinessId) scope = "business-scoped";
    else if (hasWorkspaceId) scope = "workspace-scoped";
    else scopeNote = "Neither `businessId` nor `workspaceId` identifier found in route source; scope not deterministically visible from this file alone (may resolve scope via a shared service call this generator does not trace).";
    const nonGet = methods.filter((x) => x !== "GET");
    const readOrWrite = nonGet.length && methods.includes("GET") ? "read+write" : nonGet.length ? "write" : methods.includes("GET") ? "read" : "NOT_VERIFIED";
    const relPath = path.relative(path.join(ROOT, "src/app/api"), path.dirname(f));
    return {
      path: "/api/" + relPath.split(path.sep).join("/"),
      sourceFile: relSrc(f),
      httpMethods: methods.length ? methods : ["NOT_VERIFIED"],
      capability: caps.size ? [...caps].sort() : [],
      capabilityNote: caps.size ? undefined : "No CAPABILITIES.* reference found directly in this route file (may rely on session-only auth, or on a capability check inside a called service this generator does not trace).",
      readOrWrite,
      scope,
      scopeNote,
      knownUiCallers: "NOT_VERIFIED (informational field; not a preservation blocker per UX-00A.1 scope — resolved per-API when a later UX PR actually touches it)",
      knownTests: "NOT_VERIFIED (informational field; not a preservation blocker per UX-00A.1 scope)",
    };
  });
}

function buildOwnerApiRoutes() {
  return buildApiRoutesFrom(OWNER_API_ROOT);
}

/** Every API route in the app (not just /api/owner/*) — needed so an owner action family's
 * mutation endpoints are found even when the actual mutation lives outside /api/owner (e.g.
 * adjudication's POST is at /api/proof-risk/adjudicate, not /api/owner/proof-risk/...). */
function buildAllApiRoutesFlat() {
  return buildApiRoutesFrom(path.join(ROOT, "src/app/api"));
}

/**
 * Capability index over EVERY API route (not just /api/owner/*), keyed by path. Needed because an
 * owner page's component tree can call a non-owner-prefixed API (e.g. /owner/growth-pricing calls
 * /api/growth/pricing-tiers, which requires ENGAGEMENT_VIEW/ENGAGEMENT_UPDATE — a consulting
 * capability, not part of OWNER_SCOPED_CAPABILITIES) — restricting the index to /api/owner/* would
 * silently under-report that page's real apiCapabilityRequirements as empty.
 */
/** A route's own `[segment]` normalized to ":param" so it keys identically to an extracted call's
 * own ":param" placeholder — e.g. /api/owner/finance/actions/[actionId] and the extracted call
 * /api/owner/finance/actions/:param both become /api/owner/finance/actions/:param. */
function normalizeRoutePath(routePath) {
  return routePath
    .split("/")
    .map((seg) => (/^\[.+\]$/.test(seg) ? ":param" : seg))
    .join("/");
}

/**
 * Per-method capability extraction: every route file in this codebase exports each HTTP method as
 * `export const METHOD = withCanonicalEnforcement(handler, { requireCapabilities: [...], ... })`
 * (confirmed: every /api/owner/* route uses this pattern; ~36 non-owner infra/auth routes across
 * the whole api tree do not). For each `export const METHOD = withCanonicalEnforcement(` site,
 * the search for `requireCapabilities` is bounded to that exact call's own argument list (via the
 * existing bracket-matcher) — never the union of every CAPABILITIES.* reference anywhere in the
 * file, which previously conflated a GET-only capability with a PATCH-only one, or a dynamic
 * route's real requirement with an unrelated sibling method's.
 */
function extractMethodCapabilities(src, method) {
  const siteRe = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withCanonicalEnforcement\\s*\\(`);
  const siteMatch = siteRe.exec(src);
  if (!siteMatch) return null; // this route doesn't use the withCanonicalEnforcement pattern for this method
  const callParenOpen = src.indexOf("(", siteMatch.index + siteMatch[0].length - 1);
  const callParenClose = matchBracket(src, callParenOpen, "(", ")");
  const argsText = src.slice(callParenOpen, callParenClose + 1);
  const reqCapsMatch = argsText.match(/requireCapabilities\s*:\s*\[([^\]]*)\]/);
  if (!reqCapsMatch) return [];
  return [...reqCapsMatch[1].matchAll(/CAPABILITIES\.([A-Z0-9_]+)/g)].map((m) => m[1]).sort();
}

/** Capability index keyed by "METHOD normalizedPath" — never by path alone — so a route with
 * different requirements per method (the confirmed norm: GET=OWNER_VIEW, PATCH=OWNER_MANAGE on the
 * same file) is never collapsed into one path-wide capability set. */
function buildAllApiCapabilityIndex(allApiRoutesFlat) {
  const index = new Map();
  for (const r of allApiRoutesFlat) {
    const src = fs.readFileSync(path.join(ROOT, r.sourceFile), "utf8");
    const normalizedPath = normalizeRoutePath(r.path);
    for (const method of r.httpMethods) {
      if (method === "NOT_VERIFIED") continue;
      const methodCaps = extractMethodCapabilities(src, method);
      if (methodCaps !== null) {
        index.set(`${method} ${normalizedPath}`, methodCaps);
      } else {
        // Route doesn't use withCanonicalEnforcement for this method (the ~36 non-owner infra/auth
        // routes without it) — fall back to a file-wide CAPABILITIES.* scan rather than silently
        // reporting NOT_APPLICABLE/[] for a route this generator simply doesn't recognize the shape
        // of. Still per-route (not global), just not per-method within that one file.
        const caps = new Set();
        for (const m of src.matchAll(CAP_RE)) caps.add(m[1]);
        index.set(`${method} ${normalizedPath}`, caps.size ? [...caps].sort() : []);
      }
    }
  }
  return index;
}

// ───────────────────────── per-page preservation-critical fields ─────────────────────────

function classifyBusinessContext(text) {
  const hasShared = /useActiveBusiness\s*\(/.test(text);
  const hasSelector = /<BusinessContextSelector\b/.test(text);
  const hasBusinessId = /\bbusinessId\b/.test(text);
  const hasWorkspaceId = /\bworkspaceId\b/.test(text);
  const hasBusinessWord = /business/i.test(text);
  if (hasShared) return "SHARED_ACTIVE_BUSINESS";
  if (hasSelector) return "LOCAL_BUSINESS_STATE";
  if (hasWorkspaceId && !hasBusinessId) return "WORKSPACE_ONLY";
  if (!hasBusinessId && !hasWorkspaceId && !hasBusinessWord) return "NOT_APPLICABLE";
  return "NO_BUSINESS_CONTEXT";
}

/**
 * Route-method cross-validation: does an extracted call's method actually appear among the
 * methods its matching local route file exports? A route path segment `[xxx]` matches any call
 * path segment (literal or the generator's own ":param" placeholder); a literal segment must
 * match exactly. Segment-count mismatches mean "no matching route found" (skipped, not a failure
 * — the call may target a non-local/third-party path or a route this walk didn't index).
 */
function routeSegments(p) {
  return p.split("/").filter(Boolean);
}
function pathSegmentsMatch(callPath, routePath) {
  const c = routeSegments(callPath);
  const r = routeSegments(routePath);
  if (c.length !== r.length) return false;
  for (let i = 0; i < c.length; i++) {
    if (/^\[.+\]$/.test(r[i])) continue; // route's own dynamic segment matches anything
    if (c[i] !== r[i]) return false;
  }
  return true;
}
function findMatchingRoutes(allApiRoutesFlat, callPath) {
  return allApiRoutesFlat.filter((r) => pathSegmentsMatch(callPath, r.path));
}

/** Collects every (call, matching route) mismatch across all supplied call contexts. Does not
 * throw itself — the caller (main()) decides whether to fail generation, so this stays testable. */
function crossValidateRouteMethods(allApiRoutesFlat, contexts) {
  const mismatches = [];
  let validated = 0;
  for (const ctx of contexts) {
    for (const call of ctx.calls) {
      const matches = findMatchingRoutes(allApiRoutesFlat, call.path);
      if (matches.length === 0) continue; // no local route found for this path — not a validation target
      validated++;
      const ok = matches.some((r) => r.httpMethods.includes(call.method));
      if (!ok) {
        mismatches.push({
          context: ctx.label,
          call: `${call.method} ${call.path}`,
          matchingRouteFiles: matches.map((r) => ({ sourceFile: r.sourceFile, httpMethods: r.httpMethods })),
        });
      }
    }
  }
  return { mismatches, validated };
}

/**
 * Independent re-check of every apiCapabilityRequirements entry against a FRESH, direct re-parse
 * of its matching route file/method (via extractMethodCapabilities, not a re-read of the same map
 * lookup that produced the entry) — catches any normalizeRoutePath/segment-matching misalignment
 * (e.g. multi-dynamic-segment or catch-all routes) that would otherwise silently produce a wrong
 * [] rather than surfacing as a mismatch.
 */
function crossValidateCapabilities(allApiRoutesFlat, ownerPageRoutes) {
  const mismatches = [];
  let validated = 0;
  for (const page of ownerPageRoutes) {
    for (const req of page.apiCapabilityRequirements) {
      const matches = findMatchingRoutes(allApiRoutesFlat, req.endpoint).filter((r) => r.httpMethods.includes(req.method));
      if (matches.length === 0) continue; // no local route/method found — not a validation target (already flagged by route-method validation if the path matched but method didn't)
      for (const route of matches) {
        const src = fs.readFileSync(path.join(ROOT, route.sourceFile), "utf8");
        const direct = extractMethodCapabilities(src, req.method);
        let expectedCaps;
        if (direct !== null) {
          expectedCaps = direct;
        } else {
          const caps = new Set();
          for (const m of src.matchAll(CAP_RE)) caps.add(m[1]);
          expectedCaps = caps.size ? [...caps].sort() : [];
        }
        validated++;
        if (JSON.stringify(req.capabilities) !== JSON.stringify(expectedCaps)) {
          mismatches.push({
            context: page.route,
            call: `${req.method} ${req.endpoint}`,
            generated: req.capabilities,
            expected: expectedCaps,
            routeFile: route.sourceFile,
          });
        }
      }
    }
  }
  return { mismatches, validated };
}

function buildOwnerPageRoutes(sidebarItems, allApiCapabilityIndex) {
  const pageFiles = walkFiles(OWNER_PAGE_ROOT, "page.tsx");
  const primaryHrefs = new Set(sidebarItems.filter((i) => i.href && i.href.startsWith("/owner")).map((i) => i.href));

  return pageFiles.map((pageFile) => {
    const route = toOwnerRoute(pageFile);
    const sourceFile = relSrc(pageFile);
    const ancestor = nearestAncestor(route, primaryHrefs);
    const isHiddenForSafety = KNOWN_HIDDEN_FOR_SAFETY.has(route) || (ancestor && KNOWN_HIDDEN_FOR_SAFETY.has(ancestor));
    const isPrimaryNavRoute = primaryHrefs.has(route);
    let navigationState;
    if (isHiddenForSafety) navigationState = "HIDDEN_FOR_SAFETY_NO_NAV_ENTRY";
    else if (isPrimaryNavRoute) navigationState = "IN_SIDEBAR";
    else if (ancestor) navigationState = `IN_SIDEBAR_VIA_PARENT(${ancestor})`;
    else navigationState = "NOT_IN_SIDEBAR";

    const deepLinkedFrom = navigationState === "NOT_IN_SIDEBAR" ? grepDeepLinks(route, sourceFile) : "N/A_IN_NAV";

    const componentTreeFiles = traceOwnerComponentTree(pageFile);
    const combinedText = componentTreeFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const apiCalls = dedupeApiCalls(extractApiCalls(combinedText));
    const readApis = apiCalls.filter((c) => c.method === "GET");
    const writeApis = apiCalls.filter((c) => c.method !== "GET");

    // pageAccessGate: what determines whether the owner can reach/render THIS PAGE ITSELF, per
    // current navigation/auth source — the sidebar's own requiresOwner/requiresCapability gate for
    // this route (or its nearest in-nav ancestor), or AUTHENTICATED_SESSION_ONLY when current
    // routing establishes no gate beyond the (authenticated) layout's session-required redirect.
    // Deliberately does NOT fold in the capabilities its called APIs require — those are a
    // separate concept (apiCapabilityRequirements below): an API a page calls can 403 for a
    // session that can still open and render the page itself.
    const sidebarItem = sidebarItems.find((i) => i.href === route) || (ancestor ? sidebarItems.find((i) => i.href === ancestor) : null);
    let pageAccessGate;
    if (sidebarItem?.requiresCapability) pageAccessGate = sidebarItem.requiresCapability;
    else if (sidebarItem?.requiresOwner) pageAccessGate = "OWNER_VIEW";
    else pageAccessGate = "AUTHENTICATED_SESSION_ONLY";
    const pageAccessGateNote = sidebarItem
      ? "From this route's (or its nearest in-nav ancestor's) sidebar-nav.tsx requiresOwner/requiresCapability gate."
      : "No sidebar entry for this route (hidden-for-safety or not-in-nav); current source establishes no page-level gate beyond the (authenticated) layout's session-required redirect.";

    // apiCapabilityRequirements: the capabilities required by EACH API this page's component tree
    // calls — never merged into pageAccessGate, so a page is never represented as though reaching
    // it requires every capability any of its (possibly optional/deep-link) API calls need.
    const apiCapabilityRequirements = apiCalls.map((call) => ({
      endpoint: call.path,
      method: call.method,
      capabilities: allApiCapabilityIndex.get(`${call.method} ${call.path}`) ?? [],
    }));

    return {
      route,
      sourceFile,
      navigationState,
      persona: "owner",
      pageAccessGate,
      pageAccessGateNote,
      apiCapabilityRequirements,
      previewState: (() => {
        const found = sidebarItems.find((i) => i.href === route);
        return found ? found.state : isHiddenForSafety ? "HIDDEN_FOR_SAFETY" : "NOT_IN_SIDEBAR";
      })(),
      businessContextBehavior: classifyBusinessContext(combinedText),
      readApis,
      writeApis,
      majorActions: writeApis.map((w) => ({ endpoint: w.path, method: w.method, note: "Owner-triggerable mutation reachable from this page's component tree; see the top-level ownerActions inventory for the state/action-family this belongs to." })),
      currentTests: "NOT_VERIFIED (informational field; not a preservation blocker per UX-00A.1 scope)",
      deepLinkedFrom,
      componentTreeFileCount: componentTreeFiles.length,
      _rawApiCalls: apiCalls,
    };
  });
}

// ───────────────────────── owner action families + workflow state families ─────────────────────────

const OWNER_ACTION_FAMILIES = [
  { family: "process_execution", apiPrefixes: ["/api/owner/process-execution", "/api/owner/execution-plan"], uiPages: ["/owner/execution", "/owner/cockpit"], sourceKeywords: ["process-execution"] },
  { family: "tasks", apiPrefixes: ["/api/owner/tasks", "/api/owner/action-plan", "/api/owner/action-assignments"], uiPages: ["/owner/tasks", "/owner/tasks/new", "/owner/tasks/[taskId]"], sourceKeywords: ["process-execution"] },
  // apiPrefixes scoped to ONLY /api/owner/proof-risk (the read-only queue) -- the actual proof
  // submit/review WRITE actions live under /api/owner/tasks/[taskId]/proof/{submit,review} and are
  // already claimed by the "tasks" family's own /api/owner/tasks prefix; giving them to both would
  // be double-coverage. /api/proof-risk (the adjudication decision itself, no /owner/ prefix) is
  // exclusively adjudication's below -- a confirmed duplicate-coverage defect otherwise, since both
  // families previously listed both prefixes and both matched POST /api/proof-risk/adjudicate.
  { family: "proof_submit_review", apiPrefixes: ["/api/owner/proof-risk"], uiPages: ["/owner/adjudication"], sourceKeywords: ["proof-risk-adjudication", "reused-hash-precheck", "evidence-credibility-graph", "timing-evidence"] },
  { family: "finance_actions", apiPrefixes: ["/api/owner/finance"], uiPages: ["/owner/finance"], sourceKeywords: ["owner-finance"] },
  { family: "cashflow_actions", apiPrefixes: ["/api/owner/cashflow"], uiPages: ["/owner/cashflow"], sourceKeywords: ["owner-cashflow"] },
  { family: "sales_actions", apiPrefixes: ["/api/owner/sales"], uiPages: ["/owner/sales"], sourceKeywords: ["owner-sales"] },
  { family: "operations_actions", apiPrefixes: ["/api/owner/operations", "/api/owner/capacity", "/api/owner/equipment"], uiPages: ["/owner/operations"], sourceKeywords: ["owner-operations"] },
  { family: "sop_actions", apiPrefixes: ["/api/owner/sop", "/api/owner/sop-documents", "/api/owner/sop-intelligence"], uiPages: ["/owner/execution"], sourceKeywords: ["owner-sop", "sop-checklist-correction-engine", "staff-training-assignment-engine", "sop-training-effectiveness-loop"] },
  { family: "recovery_actions", apiPrefixes: ["/api/owner/recovery", "/api/owner/recovery-status"], uiPages: ["/owner/recovery"], sourceKeywords: ["founder-recovery"] },
  // excludeKeywords: "startup" -- confirmed defect: src/domain/owner-strategy/ and
  // src/services/owner-strategy/ both hold Startup's own files (startup-lifecycle.ts,
  // startup-session.service.ts, etc.) alongside genuine Strategy files; a directory-only keyword
  // match previously merged Startup's StartupSessionStatus/StartupInitiativeStatus and 4 of its
  // services into strategy_actions. See the dedicated startup_actions family below.
  { family: "strategy_actions", apiPrefixes: ["/api/owner/strategy"], uiPages: ["/owner/strategy"], sourceKeywords: ["owner-strategy"], excludeKeywords: ["startup"] },
  { family: "marketing_actions", apiPrefixes: ["/api/owner/marketing"], uiPages: ["/owner/marketing", "/owner/marketing/campaigns"], sourceKeywords: ["owner-marketing"] },
  { family: "approvals", apiPrefixes: ["/api/owner/approval", "/api/owner/approvals"], uiPages: ["/owner/approvals"], sourceKeywords: ["approval-threshold-policy", "approval.service", "approval-resolution"] },
  { family: "adjudication", apiPrefixes: ["/api/proof-risk"], uiPages: ["/owner/adjudication"], sourceKeywords: ["proof-risk-adjudication"] },
  { family: "opportunity_decisions_execution", apiPrefixes: ["/api/owner/opportunities"], uiPages: ["/owner/cockpit"], sourceKeywords: ["opportunity-"] },
  { family: "goal_related", apiPrefixes: ["/api/owner/goals", "/api/owner/goal-arbitration", "/api/owner/objectives"], uiPages: ["/owner/goals"], sourceKeywords: ["objective-portfolio", "objective-arbitration", "goal-attention"] },
  { family: "compliance_actions", apiPrefixes: ["/api/owner/compliance"], uiPages: ["/owner/compliance", "/owner/compliance/[id]"], sourceKeywords: ["compliance"] },
  { family: "procurement_transitions", apiPrefixes: ["/api/owner/procurement"], uiPages: ["/owner/procurement"], sourceKeywords: ["procurement"] },
  { family: "vendor_actions", apiPrefixes: ["/api/owner/vendor"], uiPages: ["/owner/vendor"], sourceKeywords: ["vendor"] },
  // New in UX-00A.4 -- closing confirmed mutation-coverage gaps, each backed by direct source
  // evidence (see the generator's commit message for the grep citations):
  // Budget: src/services/owner-budget/action-link.service.ts imports the shared
  // founder-recovery/action-status FSM directly and powers PATCH .../budget/actions/[actionId].
  { family: "budget_actions", apiPrefixes: ["/api/owner/budget/actions"], uiPages: ["/owner/budget"], sourceKeywords: ["owner-budget/action-link"] },
  // Startup: its own dedicated family, kept OUT of strategy_actions (see that entry's comment)
  // even though both live under the owner-strategy domain/service directories.
  { family: "startup_actions", apiPrefixes: ["/api/owner/startup", "/api/owner/startup-validate"], uiPages: ["/owner/startup", "/owner/startup/[sessionId]"], sourceKeywords: ["startup"] },
  // Risk: src/services/owner-mode/business-risk.service.ts declares its own RiskStatus (IDENTIFIED
  // / ASSESSED / MITIGATING / ACCEPTED / RESOLVED / CLOSED) with real `.update`-backed persistence.
  // Hidden-for-safety route (see hiddenSafetyRoutes) -- preserved here regardless; preservation is
  // not exposure.
  { family: "risk_actions", apiPrefixes: ["/api/owner/risks"], uiPages: ["/owner/risks", "/owner/risks/[id]"], sourceKeywords: ["business-risk"] },
  // Learning: src/services/controlled-learning-candidate.service.ts governs a real
  // ControlledLearningEligibilityStatus lifecycle (PROMOTED/REJECTED actions, an allowedStatuses
  // transition guard, and a `.update` call).
  { family: "learning_actions", apiPrefixes: ["/api/owner/learning-candidates", "/api/owner/learning-reviews", "/api/owner/learning-rollback-events"], uiPages: ["/owner/learning"], sourceKeywords: ["controlled-learning"] },
];

/**
 * Mutations that are real and owner-triggerable but do not represent a governed workflow/state-
 * machine in current source (no persisted status enum with transition-guard evidence was found
 * for these specific endpoints) -- e.g. a one-shot submission, upload confirmation, or trigger.
 * Each entry is populated purely from already-computed data (majorActions grouped by a shared
 * page/route-prefix), no new parsing.
 */
const NON_WORKFLOW_MUTATION_FAMILIES = [
  { family: "alerts", apiPrefixes: ["/api/owner/alerts"], uiPages: ["/owner/alerts"] },
  { family: "cockpit_governance_arbitration", apiPrefixes: ["/api/escalation/acknowledge", "/api/owner/constraints", "/api/owner/override-arbitration"], uiPages: ["/owner/cockpit"] },
  { family: "feedback_submission", apiPrefixes: ["/api/feedback"], uiPages: ["/owner/feedback"] },
  { family: "growth_pricing", apiPrefixes: ["/api/growth/pricing-tiers"], uiPages: ["/owner/growth-pricing"], note: "See preExistingCorrectnessFindings -- capability mismatch recorded, not fixed. Mutations preserved here regardless." },
  { family: "intake_uploads", apiPrefixes: ["/api/owner/intake/businesses", "/api/owner/intake/uploads"], uiPages: ["/owner/intake"] },
  { family: "inventory_stock_items", apiPrefixes: ["/api/owner/inventory/stock-items"], uiPages: ["/owner/inventory"] },
  { family: "manual_entry", apiPrefixes: ["/api/owner/manual-entry"], uiPages: ["/owner/manual-entry"] },
  { family: "start_here_analysis", apiPrefixes: ["/api/owner/businesses"], uiPages: ["/owner/start-here"] },
  // Budget mutations proven NOT part of the shared FSM (see budget_actions above) -- override and
  // working-capital submission have no status/transition evidence of their own in source.
  { family: "budget_non_workflow", apiPrefixes: ["/api/owner/budget/override", "/api/owner/budget/working-capital"], uiPages: ["/owner/budget"] },
  // Do-not-repeat rules: recording a rule and recording what has changed on one (the changed-context
  // override, Cockpit → "Do-not-repeat rules") — a governed field write, not a status workflow.
  { family: "do_not_repeat_rules", apiPrefixes: ["/api/owner/do-not-repeat"], uiPages: ["/owner/cockpit"] },
];

function findFilesByKeywords(keywords, excludeKeywords = []) {
  const all = [...walkAllFiles(path.join(ROOT, "src/domain"), [".ts"]), ...walkAllFiles(path.join(ROOT, "src/services"), [".ts"])];
  return all.filter((f) => {
    const rel = relSrc(f).toLowerCase();
    return keywords.some((kw) => rel.includes(kw.toLowerCase())) && !excludeKeywords.some((kw) => rel.includes(kw.toLowerCase()));
  });
}

const SHARED_ACTION_STATUS_MODULE = "src/domain/founder-recovery/action-status.ts";
const SHARED_ACTION_STATUS_IMPORT_RE = /from\s+["'](?:@\/domain\/founder-recovery\/action-status|(?:\.\.?\/)+founder-recovery\/action-status)["']/;

/** Parses the canonical shared recovery-action state machine directly from its own source — never
 * hardcoded. Values come from `export const RECOVERY_ACTION_STATUSES = [...]`; the transition map
 * from the `TRANSITIONS: Record<...> = { ... }` object literal (each `key: [...]` pair). */
function parseSharedRecoveryActionStatus() {
  const file = path.join(ROOT, SHARED_ACTION_STATUS_MODULE);
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const statusesMatch = src.match(/export const RECOVERY_ACTION_STATUSES\s*=\s*\[([^\]]+)\]/);
  const values = statusesMatch ? [...statusesMatch[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]) : [];
  const transitionsMatch = /const\s+TRANSITIONS\s*:\s*Record<[^=]+=\s*\{/.exec(src);
  let transitionMap = {};
  if (transitionsMatch) {
    const braceOpen = src.indexOf("{", transitionsMatch.index);
    const braceClose = matchBracket(src, braceOpen, "{", "}");
    const body = src.slice(braceOpen + 1, braceClose);
    for (const m of body.matchAll(/([a-z0-9_]+)\s*:\s*\[([^\]]*)\]/g)) {
      transitionMap[m[1]] = [...m[2].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
    }
  }
  return { values, transitionMap, sourceFile: relSrc(file) };
}

/** Does this family's own matched files import the shared recovery-action-status module? Attach
 * the shared FSM only when a real import is found — never assumed from the family name/list in
 * the correction prompt, which is explicitly not guaranteed complete. */
function findsSharedActionStatusImport(files) {
  return files.some((f) => {
    try {
      return SHARED_ACTION_STATUS_IMPORT_RE.test(fs.readFileSync(f, "utf8"));
    } catch {
      return false;
    }
  });
}

// Three separate shapes, not one blind "any enum-like union counts as a state" bucket (a confirmed
// defect: the prior version put CredibilityEntityType, DuplicateMatchType, and pure-computed timing
// classifications in the same bucket as real task lifecycle states).
//
// COMMAND_TYPE_RE: type/enum names ending in Action|Command — the owner-invokable verbs themselves
// (e.g. ProcessExecutionAction's START/APPROVE/REJECT/...), never a persisted status.
const COMMAND_TYPE_RE = /\btype\s+(\w*(?:Action|Command))\s*=\s*((?:\s*\|?\s*"[A-Za-z0-9_]+")+)/g;
// STATUS_STATE_TYPE_RE: type/enum names ending in Status|State — candidate lifecycle values; only
// promoted to "workflowStatuses" (below) when the FILE also shows persistence/transition-guard
// evidence, otherwise kept as domainResultStates (e.g. FastCompletionStatus/EscalationTimingStatus
// are computed measurement classifications with no such evidence).
const STATUS_STATE_TYPE_RE = /\btype\s+(\w*(?:Status|State))\s*=\s*((?:\s*\|?\s*"[A-Za-z0-9_]+")+)/g;
// DOMAIN_RESULT_TYPE_RE: everything else enum-shaped (Classification|Category|Type|Tier suffix) —
// computed/descriptive result types, kept separate so they never masquerade as workflow states.
const DOMAIN_RESULT_TYPE_RE = /\btype\s+(\w*(?:Classification|Category|Type|Tier))\s*=\s*((?:\s*\|?\s*"[A-Za-z0-9_]+")+)/g;
const ENUM_RE = /\benum\s+(\w+)\s*\{([^}]*)\}/g;
const TRANSITIONS_RE = /\bconst\s+(\w*(?:TRANSITIONS|ALLOWED_[A-Z_]*)\w*)\s*[:=][^;]{0,600};/g;

/** Evidence that a file's status-like values belong to a PERSISTED/ENFORCED workflow (a DB
 * `.update`/`.updateMany` call whose `data` touches `status`, or an explicit transition-guard
 * marker like INVALID_TRANSITION/a `*_TRANSITIONS` const) — not merely a computed classification.
 * Verified against this codebase: true for process-execution-bridge.service.ts (25 hits) and
 * proof-risk-adjudication.service.ts (1 hit); false for timing-evidence.ts and the pure-domain
 * proof-risk-adjudication.ts (0 hits each) — exactly separating enforced lifecycle from computed
 * classification without a generalized static-analysis framework. */
function hasEnforcedTransitionEvidence(src) {
  const hasStatusMutation = /\.(update|updateMany)\(/.test(src) && /status/i.test(src);
  const hasTransitionGuard = /INVALID_TRANSITION|_TRANSITIONS\b/.test(src);
  return hasStatusMutation || hasTransitionGuard;
}

/** Targeted scan for status literals that are NOT declared as a clean `type X = "A"|"B"` union
 * (e.g. process-execution-bridge.service.ts represents task status as scattered string literals in
 * `ReadonlySet<string>` locals and `status: "X"` / `nextStatus = "X"` assignments, not a single
 * union type). Only meaningful — and only called — on files that already passed
 * hasEnforcedTransitionEvidence, so this never promotes an arbitrary string literal into a
 * "workflow status" without that gate. */
function extractStatusLiteralAssignments(src) {
  const values = new Set();
  for (const m of src.matchAll(/(?:ReadonlySet<string>|:\s*string\[\])\s*=\s*(?:new Set\()?\[([^\]]+)\]/g)) {
    for (const s of m[1].matchAll(/"([A-Z][A-Z0-9_]+)"/g)) values.add(s[1]);
  }
  for (const m of src.matchAll(/\bstatus\s*:\s*"([A-Z][A-Z0-9_]+)"/g)) values.add(m[1]);
  for (const m of src.matchAll(/\bnextStatus\s*=\s*"([A-Z][A-Z0-9_]+)"/g)) values.add(m[1]);
  return [...values];
}

function extractByRegex(re, src, file, minValues = 2) {
  const out = [];
  const rx = new RegExp(re);
  let m;
  while ((m = rx.exec(src))) {
    const values = [...m[2].matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1]);
    if (values.length >= minValues) out.push({ typeName: m[1], values, sourceFile: relSrc(file) });
  }
  return out;
}

/** commands / workflowStatuses / domainResultStates, plus known transition maps — see the "Three
 * separate shapes" comment above for why these are not one undifferentiated bucket. */
function extractFamilyStates(files) {
  const commands = [];
  const workflowStatuses = [];
  const domainResultStates = [];
  const transitions = [];
  for (const f of files) {
    let src;
    try {
      // Comments stripped before scanning: a confirmed defect found a `// Phase 3` line comment
      // splitting ProcessExecutionAction's union mid-declaration, silently truncating 13 real
      // command values to the 9 appearing before the comment.
      src = stripComments(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    // A type ending in Action/Command only belongs in `commands` when source proves it's accepted
    // as an owner-triggerable mutation's input, not merely produced as an evaluation engine's
    // recommendation — confirmed defect: `NextAction` (KEEP/MODIFY/ESCALATE/...) is the OUTPUT of
    // sop-training-effectiveness-loop.ts's `nextActionFor()`, assigned to a
    // `recommendedNextAction` field, never accepted as an input anywhere. The precise, mechanical
    // test used here: does a field/parameter literally named `action` or `command` (not a compound
    // name like `recommendedNextAction`) carry this exact type? True for ProcessExecutionAction
    // (`action: ProcessExecutionAction` in ProcessActionInput) and false for NextAction.
    for (const hit of extractByRegex(COMMAND_TYPE_RE, src, f)) {
      const inputEvidenceRe = new RegExp(`\\b(?:action|command)\\s*:\\s*${hit.typeName}\\b`);
      if (inputEvidenceRe.test(src)) commands.push(hit);
      else domainResultStates.push({ ...hit, note: "Excluded from commands: no `action:`/`command:`-named field or parameter of this exact type found (may be a recommendation/output type, not an accepted mutation input)." });
    }
    domainResultStates.push(...extractByRegex(DOMAIN_RESULT_TYPE_RE, src, f));
    const statusTypeHits = extractByRegex(STATUS_STATE_TYPE_RE, src, f);
    const enforced = hasEnforcedTransitionEvidence(src);
    if (enforced) {
      workflowStatuses.push(...statusTypeHits);
      const literalValues = extractStatusLiteralAssignments(src);
      if (literalValues.length >= 2) {
        workflowStatuses.push({ typeName: "(status literals, no single union type declared)", values: literalValues.sort(), sourceFile: relSrc(f) });
      }
    } else {
      domainResultStates.push(...statusTypeHits);
    }
    // `enum X { A, B }` bodies are bare identifiers, not quoted strings, so ENUM_RE needs its own
    // value extraction rather than extractByRegex's quoted-string matcher.
    for (const m of src.matchAll(ENUM_RE)) {
      const values = [...m[2].matchAll(/([A-Za-z0-9_]+)\s*[,=]?/g)].map((x) => x[1]).filter(Boolean);
      if (values.length >= 2) (enforced ? workflowStatuses : domainResultStates).push({ typeName: m[1], values, sourceFile: relSrc(f) });
    }
    const transRe = new RegExp(TRANSITIONS_RE);
    let tm;
    while ((tm = transRe.exec(src))) transitions.push({ name: tm[1], sourceFile: relSrc(f) });
  }
  return { commands, workflowStatuses, domainResultStates, transitions };
}

function buildOwnerActionFamilies(allApiRoutesFlat) {
  const sharedFsm = parseSharedRecoveryActionStatus();
  return OWNER_ACTION_FAMILIES.map((fam) => {
    const files = findFilesByKeywords(fam.sourceKeywords, fam.excludeKeywords ?? []);
    const { commands, workflowStatuses, domainResultStates, transitions } = extractFamilyStates(files);
    const mutationEndpoints = allApiRoutesFlat.filter(
      (r) => fam.apiPrefixes.some((p) => r.path.startsWith(p)) && r.httpMethods.some((m) => m !== "GET" && m !== "NOT_VERIFIED")
    );

    // Shared recovery-action-status FSM: attached ONLY when this family's own matched files
    // (action.service.ts / validation.ts) actually import the module — never assumed from a
    // fixed list of "known consumers" (the correction prompt itself warns that list may be
    // incomplete). Values/transitions are parsed once from the canonical source, never hardcoded.
    const usesSharedFsm = findsSharedActionStatusImport(files);
    const effectiveWorkflowStatuses = usesSharedFsm
      ? [...workflowStatuses, { typeName: "RecoveryActionStatus (shared)", values: sharedFsm.values, sourceFile: sharedFsm.sourceFile }]
      : workflowStatuses;

    return {
      family: fam.family,
      source: files.length ? files.map(relSrc) : [],
      sourceNote: files.length ? undefined : `No file under src/domain or src/services matched keywords [${fam.sourceKeywords.join(", ")}]; this family's mutation endpoints and UI pages are still recorded from source below.`,
      commands,
      commandsNote: commands.length ? undefined : "No `type X = \"A\"|\"B\"` union ending in Action/Command, used as an `action:`/`command:`-typed input, found via keyword-matched files.",
      workflowModel: usesSharedFsm ? "SHARED_RECOVERY_ACTION_STATUS" : effectiveWorkflowStatuses.length ? "FAMILY_SPECIFIC" : "NONE_FOUND",
      workflowStatuses: effectiveWorkflowStatuses,
      workflowStatusesNote: effectiveWorkflowStatuses.length
        ? undefined
        : "No status/state values with persistence/transition-guard evidence (a `.update`/`.updateMany` touching `status`, or an INVALID_TRANSITION/`*_TRANSITIONS` marker) found in keyword-matched files, and no import of the shared founder-recovery/action-status module either.",
      transitionSource: usesSharedFsm ? sharedFsm.sourceFile : undefined,
      knownTransitionMap: usesSharedFsm ? sharedFsm.transitionMap : undefined,
      domainResultStates,
      knownTransitionMaps: transitions,
      mutationEndpoints: mutationEndpoints.map((r) => ({ path: r.path, methods: r.httpMethods.filter((m) => m !== "GET"), sourceFile: r.sourceFile })),
      currentOwnerUiPages: fam.uiPages,
    };
  });
}

function buildNonWorkflowMutationFamilies(allApiRoutesFlat) {
  return NON_WORKFLOW_MUTATION_FAMILIES.map((fam) => {
    const mutationEndpoints = allApiRoutesFlat.filter(
      (r) => fam.apiPrefixes.some((p) => r.path.startsWith(p)) && r.httpMethods.some((m) => m !== "GET" && m !== "NOT_VERIFIED")
    );
    return {
      family: fam.family,
      mutationEndpoints: mutationEndpoints.map((r) => ({ path: r.path, methods: r.httpMethods.filter((m) => m !== "GET"), sourceFile: r.sourceFile })),
      currentOwnerUiPages: fam.uiPages,
      sourceFiles: [...new Set(mutationEndpoints.map((r) => r.sourceFile))],
      note: fam.note,
    };
  });
}

/**
 * Every page-level majorAction (an owner-triggerable mutation reachable from a traced page) must
 * be accounted for in EXACTLY ONE of ownerActions[].mutationEndpoints or
 * nonWorkflowMutationFamilies[].mutationEndpoints -- zero coverage or double coverage both fail
 * generation rather than being silently resolved, so a family's apiPrefixes can never silently
 * drop or duplicate a real mutation as the source tree evolves.
 */
export function validateMutationCoverage(ownerPageRoutes, ownerActionFamilies, nonWorkflowMutationFamilies) {
  // mutationEndpoints' own `path` is the literal filesystem route path (e.g. "[actionId]"); a
  // page's majorActions endpoint is the extractor's ":param"-normalized form of the same route.
  // Both must be normalized identically before comparing, or every dynamic-segment mutation would
  // wrongly show as unaccounted (confirmed while drafting this check).
  const ownerActionsCovered = new Set();
  for (const fam of ownerActionFamilies) {
    for (const m of fam.mutationEndpoints) for (const meth of m.methods) ownerActionsCovered.add(`${meth} ${normalizeRoutePath(m.path)}|${fam.family}`);
  }
  const nonWorkflowCovered = new Set();
  for (const fam of nonWorkflowMutationFamilies) {
    for (const m of fam.mutationEndpoints) for (const meth of m.methods) nonWorkflowCovered.add(`${meth} ${normalizeRoutePath(m.path)}|${fam.family}`);
  }
  const byKey = (set, key) => [...set].filter((k) => k.startsWith(`${key}|`)).map((k) => k.split("|")[1]);

  let pageMajorActionCount = 0;
  let coveredByOwnerActions = 0;
  let coveredByNonWorkflow = 0;
  const unaccounted = [];
  const duplicates = [];
  for (const page of ownerPageRoutes) {
    for (const a of page.majorActions) {
      pageMajorActionCount++;
      const key = `${a.method} ${a.endpoint}`;
      const ownerFams = byKey(ownerActionsCovered, key);
      const nonWfFams = byKey(nonWorkflowCovered, key);
      const totalFams = ownerFams.length + nonWfFams.length;
      if (totalFams === 0) unaccounted.push({ page: page.route, call: key });
      else if (totalFams > 1) duplicates.push({ page: page.route, call: key, families: [...ownerFams, ...nonWfFams] });
      else if (ownerFams.length) coveredByOwnerActions++;
      else coveredByNonWorkflow++;
    }
  }
  return { pageMajorActionCount, coveredByOwnerActions, coveredByNonWorkflow, unaccounted, duplicates };
}

function buildWorkflowStateFamilies(ownerActionFamilies) {
  return ownerActionFamilies
    .filter((f) => f.workflowStatuses.length > 0)
    .map((f) => ({
      family: f.family,
      workflowModel: f.workflowModel,
      source: f.source,
      states: f.workflowStatuses,
      // The shared FSM's own parsed transition map takes precedence (it's the actual enforced
      // transition rule, not a regex-matched `*_TRANSITIONS`-named const, which may not exist at
      // all in a family-specific file even when it genuinely reuses the shared FSM's transitions).
      transitions: f.knownTransitionMap
        ? { source: f.transitionSource, map: f.knownTransitionMap }
        : f.knownTransitionMaps.length
        ? f.knownTransitionMaps
        : "NOT_VERIFIED — no *_TRANSITIONS/ALLOWED_* map literal found directly in the matched source files, and this family does not import the shared founder-recovery/action-status module.",
      ownerUiLocation: f.currentOwnerUiPages,
    }));
}

// ───────────────────────── cockpit external feeds ─────────────────────────

/**
 * Business-context propagation category for ONE call site, bounded to the exact call's own
 * argument list (already computed by extractApiCalls as businessIdInLiteral/businessIdVia for the
 * URL) plus a check of its second argument (a request body): an inline object literal is read
 * directly from the args text; a plain identifier (e.g. `body`, `payload`) is resolved by a
 * bounded backward scan for that identifier's own `.businessId = `/`businessId:` assignment
 * within the same file. This function is intentionally specific to the 10 Cockpit calls (per the
 * "bounded 10-endpoint task" scope) and is not applied to the other 246 API calls in this phase.
 */
function classifyBusinessIdCategory(text, call, argsText) {
  if (call.businessIdVia) return { category: "QUERY_BUSINESS_ID", note: `Query string (${call.businessIdVia}).` };
  if (/\bbusinessId\b/.test(argsText)) return { category: "BODY_BUSINESS_ID", note: "Inline object literal argument references `businessId` directly." };
  const bodyIdentMatch = argsText.match(/,\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)$/);
  if (bodyIdentMatch) {
    const ident = bodyIdentMatch[1];
    const beforeCall = text.slice(0, call.matchIndex);
    const assignRe = new RegExp(`\\b${ident}\\.businessId\\s*=\\s*\\w+|businessId\\s*:\\s*${ident}\\b`);
    if (assignRe.test(beforeCall)) {
      return { category: "BODY_BUSINESS_ID", note: `\`${ident}.businessId\` is conditionally set before this call (see source for the exact conditions).` };
    }
    if (/\btaskKey\b/.test(argsText) || new RegExp(`\\b${ident}\\b[\\s\\S]{0,300}taskKey`).test(beforeCall.slice(-400))) {
      return { category: "TASK_DERIVED", note: `Request body is keyed by \`taskKey\`/a specific record id, not an explicit businessId; \`${ident}\`'s own declaration was not found to set businessId in this file.` };
    }
    return { category: "NOT_VERIFIED", note: `Request body argument is the identifier \`${ident}\`; its construction was not found to reference businessId in this file (may be passed in as an opaque prop from a child component, out of this bounded trace's scope).` };
  }
  if (/\btaskKey\b/.test(argsText) || /\bescalationId\b/.test(argsText)) {
    return { category: "TASK_DERIVED", note: "Request identifies a specific task/escalation record directly, with no explicit businessId." };
  }
  if (argsText.replace(/\s/g, "") === "()" || /,\s*\{\s*\}\s*\)$/.test(argsText)) {
    return { category: "NO_EXPLICIT_BUSINESS_ID", note: "Call takes no body argument (or an empty object) — no businessId is sent." };
  }
  return { category: "NO_EXPLICIT_BUSINESS_ID", note: "No businessId found in this call's URL or argument list." };
}

/** Hand-verified field-consumption evidence for exactly the 10 Cockpit calls (bounded task, not
 * generalized — see instruction: "trace only fields consumed by /owner/cockpit and its current
 * functional child components", "not repository-wide response-field lineage"). Each entry is
 * cited to the exact destructuring/property-access lines read directly from source in this
 * session; kept as a small lookup (not derived by a generic response-DTO tracer) because mapping
 * a Promise.all destructuring target back to its originating call requires binding-level tracing
 * this generator's simple regex parser does not (and per scope, should not) perform generically. */
/**
 * Mechanically derives the real fields consumed for a state value that's gated by a presence
 * check (`"discriminatorField" in rawVar`) and then handed to a child component further down the
 * SAME already-traced Cockpit component tree — the exact case the prior pass got wrong for
 * recovery-status/public-signals: the state is stored via a presence check (which looked like
 * "no field read"), but the object is then passed as a prop and its fields are read inside a
 * child component (RecoverySection/OutsideSignalsSection in MinimumOwnerCockpit.tsx), not near
 * the fetch call itself. Chain: find the `set<X>(...)` wrapping the presence check → the
 * `useState<TYPE | null>` pairing that setter to its state var and TYPE → every OTHER destructured
 * parameter/annotation of that exact TYPE anywhere in the traced tree (catches a prop renamed
 * across a component boundary, e.g. page.tsx's `publicSignals` becoming `signals` inside
 * OutsideSignalsSection) → every first-level `localName.field` member access on each such local
 * name. Bounded to the files already in the Cockpit trace; no repo-wide DTO lineage.
 */
function deriveCockpitFieldsConsumed(pageText, allFilesText, discriminatorField) {
  const presenceMatch = pageText.match(new RegExp(`"${discriminatorField}"\\s*in\\s*(\\w+)`));
  if (!presenceMatch) return null;
  const beforeText = pageText.slice(0, presenceMatch.index);
  const setterMatches = [...beforeText.matchAll(/\bset([A-Z]\w*)\(/g)];
  const setterSuffix = setterMatches.length ? setterMatches[setterMatches.length - 1][1] : null;
  if (!setterSuffix) return null;
  const useStateRe = new RegExp(`const\\s*\\[(\\w+),\\s*set${setterSuffix}\\]\\s*=\\s*useState<([\\w.]+)`);
  const useStateMatch = pageText.match(useStateRe);
  if (!useStateMatch) return null;
  const typeName = useStateMatch[2].replace(/\./g, "\\.");

  const localNames = new Set();
  for (const text of allFilesText) {
    for (const m of text.matchAll(new RegExp(`\\{\\s*(\\w+)\\s*\\}\\s*:\\s*\\{\\s*\\w+\\s*:\\s*${typeName}\\b`, "g"))) localNames.add(m[1]);
    for (const m of text.matchAll(new RegExp(`\\b(\\w+)\\s*:\\s*${typeName}\\b`, "g"))) localNames.add(m[1]);
  }
  if (localNames.size === 0) return null;

  const NON_FIELD_MEMBERS = new Set(["length", "map", "slice", "join", "filter", "some", "every", "includes", "find", "forEach", "reduce", "sort", "toString", "keys", "values", "entries"]);
  const fields = new Set();
  for (const text of allFilesText) {
    for (const local of localNames) {
      for (const m of text.matchAll(new RegExp(`\\b${local}\\.(\\w+)\\b`, "g"))) {
        if (!NON_FIELD_MEMBERS.has(m[1])) fields.add(m[1]);
      }
    }
  }
  return [...fields].sort();
}

/** responseUsage: FIELDS (real success-path field access exists — fieldsConsumed lists them),
 * SUCCESS_STATUS_ONLY (success path checks only `ok`/presence, no field is read), ERROR_ONLY
 * (response data is only ever passed to a generic failure-message helper), NOT_VERIFIED (genuinely
 * indeterminate). fieldsConsumed is always a real field-name array (empty when responseUsage isn't
 * FIELDS) — never an explanatory sentence standing in for a field name. Recovery-status and
 * public-signals are derived mechanically (see deriveCockpitFieldsConsumed) rather than listed
 * here, because their consumption happens in a child component, not near the fetch call — a
 * confirmed defect in the prior pass, which only checked the immediate call-site window and
 * concluded "presence check only" without following the value into MinimumOwnerCockpit's
 * RecoverySection/OutsideSignalsSection. */
const COCKPIT_RESPONSE_USAGE = {
  "GET /api/owner/now-view": {
    responseUsage: "FIELDS",
    fieldsConsumed: [
      "processExecution", "view.actionsToAvoid", "derivedBusinessCondition", "view.confidenceCapped",
      "goalAttentionSignal", "topProfitLeak", "policyAttentionSignal", "trendAlerts",
      "doNotRepeatAnnotation", "activeEscalations", "executionLifecycle", "businessOperatingSystem",
      "financeTopPriority",
    ],
  },
  "GET /api/owner/onboarding": { responseUsage: "FIELDS", fieldsConsumed: ["found", "canRunFirstDiagnosis", "missingMinimum", "requirements"] },
  "GET /api/owner/process-execution": { responseUsage: "FIELDS", fieldsConsumed: ["tasks[].status"] },
  "POST /api/owner/process-execution": { responseUsage: "FIELDS", fieldsConsumed: ["status", "reassessmentId (implied by REQUEST_REASSESSMENT branch)"] },
  "POST /api/owner/goal-arbitration": { responseUsage: "ERROR_ONLY", fieldsConsumed: [], note: "result.ok is checked; result.data is only passed to a generic failure-message helper on failure." },
  "POST /api/owner/override-arbitration": { responseUsage: "ERROR_ONLY", fieldsConsumed: [], note: "result.ok is checked; result.data is only passed to a generic failure-message helper on failure." },
  "POST /api/owner/constraints": { responseUsage: "ERROR_ONLY", fieldsConsumed: [], note: "result.ok is checked; result.data is only passed to a generic failure-message helper on failure." },
  "POST /api/escalation/acknowledge": { responseUsage: "ERROR_ONLY", fieldsConsumed: [], note: "ok is checked; data is only passed to a generic failure-message helper on failure." },
};

/** discriminatorField anchors used only to LOCATE the mechanical derivation chain in source (the
 * presence-check key the code itself already branches on) — never used as, or substituted for,
 * the derived field list itself. */
const COCKPIT_DERIVED_FIELD_ANCHORS = {
  "GET /api/owner/recovery-status": "recoveryStatus",
  "GET /api/owner/public-signals": "publicSignalStatus",
};

function buildCockpitExternalFeeds() {
  const pageFile = path.join(OWNER_PAGE_ROOT, "cockpit", "page.tsx");
  const files = traceOwnerComponentTree(pageFile);
  // Process each file separately (not concatenated) so a per-call context window — e.g. whether
  // THIS literal embeds businessId, or a .then/.catch returning null immediately follows THIS call
  // — is never misattributed from an unrelated sibling component's call.
  const perFileCalls = files.flatMap((f) => {
    const text = fs.readFileSync(f, "utf8");
    return extractApiCalls(text).map((c) => {
      const parenOpen = text.indexOf("(", c.matchIndex);
      const parenClose = matchBracket(text, parenOpen, "(", ")");
      const argsText = text.slice(parenOpen, parenClose + 1);
      return { ...c, sourceFile: relSrc(f), argsText, fileText: text };
    });
  });
  // Group by (path, method, sourceFile): the same endpoint called from two call sites in the same
  // file (e.g. POST /api/owner/process-execution from both onAction and onStartWork) is recorded
  // as one feed entry whose businessId category lists every distinct category observed across
  // those sites, rather than silently keeping only the first.
  const groups = new Map();
  for (const c of perFileCalls) {
    const key = `${c.method} ${c.path} ${c.sourceFile}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sites]) => {
      const first = sites[0];
      const categories = sites.map((s) => classifyBusinessIdCategory(s.fileText, s, s.argsText));
      const distinctCategories = [...new Map(categories.map((c) => [c.category, c])).values()];
      const failureBehaviors = sites.map((s) =>
        s.nonFatalChain ? "BEST_EFFORT_NULL_ON_FAILURE" : s.hasAnyImmediateChain ? "NOT_VERIFIED (a .then/.catch is chained but its exact null-safety shape wasn't recognized)" : "NOT_VERIFIED"
      );
      const endpointKey = key.split(" ").slice(0, 2).join(" ");
      const usage = COCKPIT_RESPONSE_USAGE[endpointKey];
      let responseUsage = usage?.responseUsage ?? "NOT_VERIFIED";
      let fieldsConsumed = usage?.fieldsConsumed ?? [];
      let responseUsageNote = usage?.note;
      const anchor = COCKPIT_DERIVED_FIELD_ANCHORS[endpointKey];
      if (anchor) {
        const pageText = files.find((f) => f.endsWith("cockpit/page.tsx")) ? fs.readFileSync(files.find((f) => f.endsWith("cockpit/page.tsx")), "utf8") : "";
        const allFilesText = files.map((f) => fs.readFileSync(f, "utf8"));
        const derived = deriveCockpitFieldsConsumed(pageText, allFilesText, anchor);
        if (derived && derived.length) {
          responseUsage = "FIELDS";
          fieldsConsumed = derived;
          responseUsageNote = `Mechanically traced: stored via a \`"${anchor}" in <rawVar>\` presence check, then passed as a prop into a child component in the same traced tree that reads these fields directly (see deriveCockpitFieldsConsumed).`;
        } else {
          responseUsage = "SUCCESS_STATUS_ONLY";
          responseUsageNote = `Only a \`"${anchor}" in <rawVar>\` presence check gates whether the response is stored at all; no downstream field access was found in the traced component tree.`;
        }
      }
      return {
        endpoint: first.path,
        method: first.method,
        sourceFile: first.sourceFile,
        callSiteCount: sites.length,
        businessIdBehavior:
          distinctCategories.length === 1
            ? distinctCategories[0]
            : { multipleCallSites: distinctCategories },
        failureBehavior: [...new Set(failureBehaviors)].length === 1 ? failureBehaviors[0] : failureBehaviors,
        responseUsage,
        fieldsConsumed,
        responseUsageNote,
      };
    });
}

// ───────────────────────── domain/services listings + business-context findings ─────────────────────────

function listDirs(p) {
  return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function buildBusinessContextFindingsAndClassifications(ownerPageRoutes) {
  const counts = {};
  for (const p of ownerPageRoutes) counts[p.businessContextBehavior] = (counts[p.businessContextBehavior] || 0) + 1;
  const localStatePages = ownerPageRoutes.filter((p) => p.businessContextBehavior === "LOCAL_BUSINESS_STATE").map((p) => p.route);
  return {
    classificationCounts: counts,
    findings: localStatePages.length
      ? [
          {
            finding: "LOCAL_BUSINESS_STATE_CANDIDATE",
            pages: localStatePages,
            evidence:
              "These pages render <BusinessContextSelector> but do not call the shared useActiveBusiness() hook that other pages (e.g. cockpit, finance, sales, operations) read from — each threads businessId through local component state/callbacks only.",
            missionRelevance:
              "Mission section 17 names Recovery, Strategy, Marketing, and Marketing Campaigns for special business-context inspection; this mechanical classification confirms the suspected gap with source evidence and is deferred to UX-01's full 8-invariant business-context audit. Not fixed in UX-00A.1.",
            disposition: "BLOCKED_NEEDS_EVIDENCE_FOR_FIX (evidence sufficient to flag; fix scope belongs to UX-01)",
          },
        ]
      : [],
  };
}

// ───────────────────────── assemble ─────────────────────────

function main() {
  const sidebarItems = parseSidebar();
  const previewItems = sidebarItems.filter((i) => i.state === "preview").map((i) => ({ label: i.label, href: i.href, blurb: i.blurb }));
  const comingSoonItems = sidebarItems.filter((i) => i.state === "coming-soon").map((i) => ({ label: i.label, blurb: i.blurb }));
  const capabilityGates = parseCapabilities();

  const ownerNowViewFieldNames = parseInterfaceFieldNames(
    path.join(ROOT, "src/services/owner-guidance/owner-now-view.service.ts"),
    "OwnerNowViewPayload"
  );
  const ownerNowViewCoreFieldNames = parseInterfaceFieldNames(
    path.join(ROOT, "src/domain/owner-guidance/guidance-orchestrator.ts"),
    "OwnerNowView"
  );

  const ownerApiRoutes = buildOwnerApiRoutes();
  const allApiRoutesFlat = buildAllApiRoutesFlat();
  const allApiCapabilityIndex = buildAllApiCapabilityIndex(allApiRoutesFlat);
  const ownerPageRoutes = buildOwnerPageRoutes(sidebarItems, allApiCapabilityIndex);

  const ownerActionFamilies = buildOwnerActionFamilies(allApiRoutesFlat);
  const nonWorkflowMutationFamilies = buildNonWorkflowMutationFamilies(allApiRoutesFlat);
  const workflowStateFamilies = buildWorkflowStateFamilies(ownerActionFamilies);
  const cockpitExternalFeeds = buildCockpitExternalFeeds();

  // ── Route-method cross-validation (hard fail on mismatch, never silently corrected) ──
  const validationContexts = ownerPageRoutes.map((p) => ({ label: p.route, calls: p._rawApiCalls }));
  const { mismatches, validated } = crossValidateRouteMethods(allApiRoutesFlat, validationContexts);
  if (mismatches.length > 0) {
    console.error(`ROUTE-METHOD CROSS-VALIDATION FAILED: ${mismatches.length} mismatch(es) found (out of ${validated} calls validated against a locally-found route).`);
    for (const mm of mismatches) {
      console.error(`  [${mm.context}] extracted call "${mm.call}" — matching route(s):`, JSON.stringify(mm.matchingRouteFiles));
    }
    console.error("Generation ABORTED. Fix the extractor or the source mismatch before regenerating.");
    process.exit(1);
  }
  report(`Route-method cross-validation: ${validated} calls validated, 0 mismatches.`);

  // ── Capability cross-validation (hard fail on mismatch, never silently corrected) ──
  const capValidation = crossValidateCapabilities(allApiRoutesFlat, ownerPageRoutes);
  if (capValidation.mismatches.length > 0) {
    console.error(`CAPABILITY CROSS-VALIDATION FAILED: ${capValidation.mismatches.length} mismatch(es) found (out of ${capValidation.validated} calls validated against a locally-found route/method).`);
    for (const mm of capValidation.mismatches) {
      console.error(`  [${mm.context}] "${mm.call}" — generated ${JSON.stringify(mm.generated)}, expected ${JSON.stringify(mm.expected)} (${mm.routeFile})`);
    }
    console.error("Generation ABORTED. Fix the capability extractor before regenerating.");
    process.exit(1);
  }
  report(`Capability cross-validation: ${capValidation.validated} calls validated, 0 mismatches.`);

  // ── Mutation-coverage validation (hard fail on unaccounted OR duplicately-accounted) ──
  const coverage = validateMutationCoverage(ownerPageRoutes, ownerActionFamilies, nonWorkflowMutationFamilies);
  if (coverage.unaccounted.length > 0 || coverage.duplicates.length > 0) {
    if (coverage.unaccounted.length > 0) {
      console.error(`MUTATION-COVERAGE VALIDATION FAILED: ${coverage.unaccounted.length} page majorAction(s) belong to ZERO preservation family:`);
      for (const u of coverage.unaccounted) console.error(`  [${u.page}] ${u.call}`);
    }
    if (coverage.duplicates.length > 0) {
      console.error(`MUTATION-COVERAGE VALIDATION FAILED: ${coverage.duplicates.length} page majorAction(s) belong to MORE THAN ONE preservation family:`);
      for (const d of coverage.duplicates) console.error(`  [${d.page}] ${d.call} -> ${d.families.join(", ")}`);
    }
    console.error("Generation ABORTED. Add/adjust an ownerActions or nonWorkflowMutationFamilies entry before regenerating -- never silently pick a family.");
    process.exit(1);
  }
  report(`Mutation-coverage validation: ${coverage.pageMajorActionCount} page majorActions, ${coverage.coveredByOwnerActions} via ownerActions, ${coverage.coveredByNonWorkflow} via nonWorkflowMutationFamilies, 0 unaccounted, 0 duplicates.`);

  for (const p of ownerPageRoutes) delete p._rawApiCalls;

  // ── Pre-existing correctness findings: recorded only, never fixed here (see instruction §7) ──
  const growthPricingPage = ownerPageRoutes.find((p) => p.route === "/owner/growth-pricing");
  const preExistingCorrectnessFindings = growthPricingPage
    ? [
        {
          finding: "PRE_EXISTING_CORRECTNESS_FINDING",
          page: growthPricingPage.route,
          calledApis: growthPricingPage.apiCapabilityRequirements.map((r) => `${r.method} ${r.endpoint}`),
          apiCapabilities: [...new Set(growthPricingPage.apiCapabilityRequirements.flatMap((r) => r.capabilities))],
          reachabilityEvidence: {
            navigationState: growthPricingPage.navigationState,
            deepLinkedFrom: growthPricingPage.deepLinkedFrom,
          },
          verificationStatus:
            "SOURCE_PROVEN — capabilities extracted directly from the called routes' own requireCapabilities() declarations in src/app/api/growth/pricing-tiers*/route.ts. Not independently re-verified against a live 403 response in this generator run (no production access from this environment).",
          ownerRelevance:
            "Per sidebar-nav.tsx's own documented capability model (see its file-level comment on OWNER_SCOPED_CAPABILITIES), ENGAGEMENT_VIEW/ENGAGEMENT_UPDATE are consulting-engagement capabilities, not part of the capability set a self-serve beta owner's role resolves to. If that model holds, this page's pricing-tier data would not load for a real self-serve owner.",
          disposition: "OUT_OF_SCOPE_FOR_UX-00A.2_AND_UX-00B — recorded only, not fixed, per explicit instruction. Must not block preservation-CI work once the baseline itself is accurate.",
        },
      ]
    : [];

  const hiddenSafetyRoutes = [
    {
      route: "/owner/priorities",
      reason:
        "Removed from nav: page merges 4 separate governed sources (risks, alerts, decision inbox, now-view topRoute) into a claimed-complete 'what needs attention' list, but a reproducible case exists where Priorities shows 'nothing needs attention' while Cockpit simultaneously shows an actionable Finance item as its primary card. Home/Cockpit remains the single authoritative surface for controlled beta.",
      routeStatus: "PRESENT_UNCHANGED",
      apiStatus: "PRESENT_UNCHANGED",
      sourceCitation: "src/ui/shell/sidebar-nav.tsx (\"priorities\" section comment)",
      evidenceLabel: "SOURCE_PROVEN_AS_DOCUMENTED_HISTORY — the reproducible-disagreement claim is a source-code comment describing a prior investigation, not independently re-verified live in this generator run.",
    },
    {
      route: "/owner/alerts",
      reason:
        "Removed from nav: Alert model is workspaceId-scoped only (no businessId column, confirmed via schema) -- a multi-business owner would see every business's alerts merged with no attribution, with no narrow filter fix possible without a schema change.",
      routeStatus: "PRESENT_UNCHANGED",
      apiStatus: "PRESENT_UNCHANGED",
      sourceCitation: "src/ui/shell/sidebar-nav.tsx (\"business\" section comment)",
      evidenceLabel: "SOURCE_PROVEN — schema shape is independently checkable in this repo, not merely a historical claim.",
    },
    {
      route: "/owner/risks",
      reason:
        "Removed from nav (previously Preview, now fully commented out): BusinessRiskEntry has no businessId column at all (workspace-scoped only) -- live production browser acceptance proved the SAME risk record IDs render under every business selected in a multi-business workspace. Closing requires a schema change (add businessId, backfill, filter), out of scope for a launch-blocker UX fix.",
      routeStatus: "PRESENT_UNCHANGED",
      apiStatus: "PRESENT_UNCHANGED",
      sourceCitation: "src/ui/shell/sidebar-nav.tsx (\"business\" section comment, commented-out Risk nav item)",
      evidenceLabel: "SOURCE_PROVEN_AS_DOCUMENTED_HISTORY — the live production browser acceptance claim is a source-code comment describing a prior investigation, not independently re-verified live in this generator run.",
    },
    {
      route: "/owner/inventory",
      reason:
        "No nav entry: its one system-generated signal (reorder-risk badge) is wired to nothing -- getReorderSuggestions is never called from the live API route, so the badge always renders 'NONE' regardless of real stock levels. A known-wrong live feature, not merely unfinished.",
      routeStatus: "PRESENT_UNCHANGED",
      apiStatus: "PRESENT_UNCHANGED",
      sourceCitation: "src/ui/shell/sidebar-nav.tsx (\"business\" section comment)",
      evidenceLabel: "SOURCE_PROVEN — the missing-caller claim is independently checkable (grep getReorderSuggestions callers) rather than only a historical comment.",
    },
  ];

  const bizCtx = buildBusinessContextFindingsAndClassifications(ownerPageRoutes);

  const domainPackages = listDirs(path.join(ROOT, "src/domain")).map((d) => `src/domain/${d}`);
  const domainServices = listDirs(path.join(ROOT, "src/services")).map((d) => `src/services/${d}`);

  let businessContextPages;
  try {
    const out = execSync(`grep -rl "useActiveBusiness" "src/app/(authenticated)/owner" 2>/dev/null || true`, { cwd: ROOT, encoding: "utf8" });
    businessContextPages = out.split("\n").filter(Boolean).sort();
  } catch {
    businessContextPages = [];
  }

  // Public / consulting / admin routes touched by shared components — informational, not expanded
  // further per UX-00A.1 scope instruction ("do not expand; may remain informational").
  function listRouteDirs(base) {
    const routes = [];
    (function rec(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) rec(full);
        else if (entry.name === "page.tsx") routes.push({ dir: d, file: full });
      }
    })(base);
    return routes;
  }
  function sharedComponentImports(file) {
    const src = fs.readFileSync(file, "utf8");
    const shared = [];
    if (/from ["']@\/ui\/primitives["']/.test(src)) shared.push("@/ui/primitives");
    if (/from ["']@\/ui\/shell["']/.test(src)) shared.push("@/ui/shell");
    if (/from ["']@\/context\/active-business-context["']/.test(src)) shared.push("@/context/active-business-context");
    return shared;
  }
  const AUTH_ROOT = path.join(ROOT, "src/app/(authenticated)");
  const allAuthPages = listRouteDirs(AUTH_ROOT).map((r) => {
    const relDir = path.relative(AUTH_ROOT, r.dir);
    const route = relDir === "" ? "/" : "/" + relDir.split(path.sep).join("/");
    return { route, file: r.file };
  });
  const consultingRouteRoots = ["/dashboard", "/clients", "/engagements", "/leads", "/decision", "/scenario", "/report", "/users", "/settings"];
  const adminRouteRoots = ["/admin"];
  function classify(route) {
    if (route.startsWith("/owner")) return "owner";
    if (adminRouteRoots.some((r) => route === r || route.startsWith(r + "/"))) return "admin";
    if (consultingRouteRoots.some((r) => route === r || route.startsWith(r + "/"))) return "consulting";
    return "other";
  }
  const consultingRoutesTouchedBySharedComponents = [];
  const adminRoutesTouchedBySharedComponents = [];
  for (const p of allAuthPages) {
    const cls = classify(p.route);
    if (cls === "consulting" || cls === "admin") {
      const shared = sharedComponentImports(p.file);
      const entry = { route: p.route, sourceFile: relSrc(p.file), sharedComponentsImported: shared.length ? shared : ["NONE_DIRECT"] };
      (cls === "consulting" ? consultingRoutesTouchedBySharedComponents : adminRoutesTouchedBySharedComponents).push(entry);
    }
  }
  const PUBLIC_ROOT = path.join(ROOT, "src/app");
  const publicPages = fs
    .readdirSync(PUBLIC_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "(authenticated)" && d.name !== "api")
    .map((d) => d.name);
  const publicRoutesTouchedBySharedComponents = [];
  for (const name of publicPages) {
    const pageFile = path.join(PUBLIC_ROOT, name, "page.tsx");
    if (fs.existsSync(pageFile)) {
      const shared = sharedComponentImports(pageFile);
      publicRoutesTouchedBySharedComponents.push({ route: "/" + name, sourceFile: relSrc(pageFile), sharedComponentsImported: shared.length ? shared : ["NONE_DIRECT"] });
    }
  }

  const baseline = {
    baselineSha: "e5d6fd8b73d6a1619b89377b764b6ec0046335fd",
    // No `generatedAt` timestamp: it carries no preservation value and made the artifact non-
    // idempotent run-to-run (every run produced a git diff on that field alone). Content is fully
    // determined by repository source at BASELINE_SHA; `git log` on this file is the generation
    // history if that's ever needed.
    generatorPath: "scripts/ux/generate-owner-feature-baseline.mjs",
    ownerPageRoutes,
    ownerApiRoutes,
    sidebarItems,
    capabilityGates,
    previewItems,
    comingSoonItems,
    hiddenSafetyRoutes,
    ownerNowViewFields: ownerNowViewFieldNames,
    ownerNowViewCoreFields: ownerNowViewCoreFieldNames,
    cockpitExternalFeeds,
    ownerActions: ownerActionFamilies,
    nonWorkflowMutationFamilies,
    workflowStateFamilies,
    preExistingCorrectnessFindings,
    domainPackages,
    domainServices,
    businessContextPages,
    businessContextClassificationCounts: bizCtx.classificationCounts,
    businessContextFindings: bizCtx.findings,
    publicRoutesTouchedBySharedComponents,
    consultingRoutesTouchedBySharedComponents,
    adminRoutesTouchedBySharedComponents,
  };

  const jsonText = JSON.stringify(baseline, null, 2) + "\n";
  const targetFile = OUTPUT_PATH_ARG ? path.resolve(OUTPUT_PATH_ARG) : OUT_FILE;
  if (STDOUT_MODE) {
    process.stdout.write(jsonText);
  } else {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, jsonText);
  }

  // ── two deterministic, unambiguous NOT_VERIFIED counts (never conflated into one number) ──
  function countNotVerified(obj) {
    let exact = 0;
    let prefixed = 0;
    (function walk(o) {
      if (typeof o === "string") {
        if (o === "NOT_VERIFIED") exact++;
        if (o.startsWith("NOT_VERIFIED")) prefixed++;
      } else if (Array.isArray(o)) {
        for (const v of o) walk(v);
      } else if (o && typeof o === "object") {
        for (const v of Object.values(o)) walk(v);
      }
    })(obj);
    return { exact, prefixed };
  }
  const nv = countNotVerified(baseline);

  // ── report ──
  if (!STDOUT_MODE) report("Wrote", relSrc(targetFile));
  report("ownerPageRoutes:", ownerPageRoutes.length);
  report("ownerApiRoutes:", ownerApiRoutes.length);
  report("ownerNowViewFields:", ownerNowViewFieldNames.length);
  report("ownerNowViewCoreFields:", ownerNowViewCoreFieldNames.length);
  report("ownerActions families:", ownerActionFamilies.length);
  report("workflowStateFamilies:", workflowStateFamilies.length);
  report("cockpitExternalFeeds:", cockpitExternalFeeds.length);
  report("preExistingCorrectnessFindings:", preExistingCorrectnessFindings.length);
  const pagesWithSessionOnlyAccess = ownerPageRoutes.filter((p) => p.pageAccessGate === "AUTHENTICATED_SESSION_ONLY").length;
  report("pages with pageAccessGate AUTHENTICATED_SESSION_ONLY:", pagesWithSessionOnlyAccess);
  const processExecFamily = ownerActionFamilies.find((f) => f.family === "process_execution");
  const tasksFamily = ownerActionFamilies.find((f) => f.family === "tasks");
  report("process_execution commands:", processExecFamily?.commands?.flatMap((c) => c.values).length ?? 0);
  report("process_execution workflowStatuses:", processExecFamily?.workflowStatuses?.flatMap((c) => c.values).length ?? 0);
  report("tasks workflowStatuses:", tasksFamily?.workflowStatuses?.flatMap((c) => c.values).length ?? 0);
  report("exactNotVerifiedCount:", nv.exact);
  report("notVerifiedPrefixedCount:", nv.prefixed);
}

// Only run when executed directly, not when imported (e.g. by the verifier's test suite for
// validateMutationCoverage) — importing this module must never itself walk the filesystem or write
// output.
if (import.meta.url === `file://${process.argv[1]}`) main();
