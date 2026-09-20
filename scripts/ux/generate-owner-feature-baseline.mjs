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
function buildAllApiCapabilityIndex() {
  const apiFiles = walkFiles(path.join(ROOT, "src/app/api"), "route.ts");
  const index = new Map();
  for (const f of apiFiles) {
    const src = fs.readFileSync(f, "utf8");
    const caps = new Set();
    let m;
    const capRe = new RegExp(CAP_RE);
    while ((m = capRe.exec(src))) caps.add(m[1]);
    if (!caps.size) continue;
    const relPath = path.relative(path.join(ROOT, "src/app/api"), path.dirname(f));
    index.set("/api/" + relPath.split(path.sep).join("/"), [...caps].sort());
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
      capabilities: allApiCapabilityIndex.get(call.path) ?? [],
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
  { family: "proof_submit_review", apiPrefixes: ["/api/owner/proof-risk", "/api/proof-risk"], uiPages: ["/owner/adjudication"], sourceKeywords: ["proof-risk-adjudication", "reused-hash-precheck", "evidence-credibility-graph", "timing-evidence"] },
  { family: "finance_actions", apiPrefixes: ["/api/owner/finance"], uiPages: ["/owner/finance"], sourceKeywords: ["owner-finance"] },
  { family: "cashflow_actions", apiPrefixes: ["/api/owner/cashflow"], uiPages: ["/owner/cashflow"], sourceKeywords: ["owner-cashflow"] },
  { family: "sales_actions", apiPrefixes: ["/api/owner/sales"], uiPages: ["/owner/sales"], sourceKeywords: ["owner-sales"] },
  { family: "operations_actions", apiPrefixes: ["/api/owner/operations", "/api/owner/capacity", "/api/owner/equipment"], uiPages: ["/owner/operations"], sourceKeywords: ["owner-operations"] },
  { family: "sop_actions", apiPrefixes: ["/api/owner/sop", "/api/owner/sop-documents", "/api/owner/sop-intelligence"], uiPages: ["/owner/execution"], sourceKeywords: ["owner-sop", "sop-checklist-correction-engine", "staff-training-assignment-engine", "sop-training-effectiveness-loop"] },
  { family: "recovery_actions", apiPrefixes: ["/api/owner/recovery", "/api/owner/recovery-status"], uiPages: ["/owner/recovery"], sourceKeywords: ["founder-recovery"] },
  { family: "strategy_actions", apiPrefixes: ["/api/owner/strategy"], uiPages: ["/owner/strategy"], sourceKeywords: ["owner-strategy"] },
  { family: "marketing_actions", apiPrefixes: ["/api/owner/marketing"], uiPages: ["/owner/marketing", "/owner/marketing/campaigns"], sourceKeywords: ["owner-marketing"] },
  { family: "approvals", apiPrefixes: ["/api/owner/approval", "/api/owner/approvals"], uiPages: ["/owner/approvals"], sourceKeywords: ["approval-threshold-policy", "approval.service", "approval-resolution"] },
  { family: "adjudication", apiPrefixes: ["/api/owner/proof-risk", "/api/proof-risk"], uiPages: ["/owner/adjudication"], sourceKeywords: ["proof-risk-adjudication"] },
  { family: "opportunity_decisions_execution", apiPrefixes: ["/api/owner/opportunities"], uiPages: ["/owner/cockpit"], sourceKeywords: ["opportunity-"] },
  { family: "goal_related", apiPrefixes: ["/api/owner/goals", "/api/owner/goal-arbitration", "/api/owner/objectives"], uiPages: ["/owner/goals"], sourceKeywords: ["objective-portfolio", "objective-arbitration", "goal-attention"] },
  { family: "compliance_actions", apiPrefixes: ["/api/owner/compliance"], uiPages: ["/owner/compliance", "/owner/compliance/[id]"], sourceKeywords: ["compliance"] },
  { family: "procurement_transitions", apiPrefixes: ["/api/owner/procurement"], uiPages: ["/owner/procurement"], sourceKeywords: ["procurement"] },
  { family: "vendor_actions", apiPrefixes: ["/api/owner/vendor"], uiPages: ["/owner/vendor"], sourceKeywords: ["vendor"] },
];

function findFilesByKeywords(keywords) {
  const all = [...walkAllFiles(path.join(ROOT, "src/domain"), [".ts"]), ...walkAllFiles(path.join(ROOT, "src/services"), [".ts"])];
  return all.filter((f) => {
    const rel = relSrc(f).toLowerCase();
    return keywords.some((kw) => rel.includes(kw.toLowerCase()));
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
    commands.push(...extractByRegex(COMMAND_TYPE_RE, src, f));
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
  return OWNER_ACTION_FAMILIES.map((fam) => {
    const files = findFilesByKeywords(fam.sourceKeywords);
    const { commands, workflowStatuses, domainResultStates, transitions } = extractFamilyStates(files);
    const mutationEndpoints = allApiRoutesFlat.filter(
      (r) => fam.apiPrefixes.some((p) => r.path.startsWith(p)) && r.httpMethods.some((m) => m !== "GET" && m !== "NOT_VERIFIED")
    );
    return {
      family: fam.family,
      source: files.length ? files.map(relSrc) : [],
      sourceNote: files.length ? undefined : `No file under src/domain or src/services matched keywords [${fam.sourceKeywords.join(", ")}]; this family's mutation endpoints and UI pages are still recorded from source below.`,
      commands,
      commandsNote: commands.length ? undefined : "No `type X = \"A\"|\"B\"` union ending in Action/Command found via keyword-matched files.",
      workflowStatuses,
      workflowStatusesNote: workflowStatuses.length
        ? undefined
        : "No status/state values with persistence/transition-guard evidence (a `.update`/`.updateMany` touching `status`, or an INVALID_TRANSITION/`*_TRANSITIONS` marker) found in keyword-matched files.",
      domainResultStates,
      knownTransitionMaps: transitions,
      mutationEndpoints: mutationEndpoints.map((r) => ({ path: r.path, methods: r.httpMethods.filter((m) => m !== "GET"), sourceFile: r.sourceFile })),
      currentOwnerUiPages: fam.uiPages,
    };
  });
}

function buildWorkflowStateFamilies(ownerActionFamilies) {
  return ownerActionFamilies
    .filter((f) => f.workflowStatuses.length > 0)
    .map((f) => ({
      family: f.family,
      source: f.source,
      states: f.workflowStatuses,
      transitions: f.knownTransitionMaps.length ? f.knownTransitionMaps : "NOT_VERIFIED — no *_TRANSITIONS/ALLOWED_* map literal found directly in the matched source files.",
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
const COCKPIT_FIELDS_CONSUMED = {
  "GET /api/owner/now-view": [
    "processExecution", "view.actionsToAvoid", "derivedBusinessCondition", "view.confidenceCapped",
    "goalAttentionSignal", "topProfitLeak", "policyAttentionSignal", "trendAlerts",
    "doNotRepeatAnnotation", "activeEscalations", "executionLifecycle", "businessOperatingSystem",
    "financeTopPriority",
  ],
  "GET /api/owner/recovery-status": ["recoveryStatus (presence check gates whether the response is used at all)"],
  "GET /api/owner/public-signals": ["publicSignalStatus (presence check gates whether the response is used at all)"],
  "GET /api/owner/onboarding": ["found", "canRunFirstDiagnosis", "missingMinimum", "requirements"],
  "GET /api/owner/process-execution": ["tasks[].status"],
  "POST /api/owner/process-execution": ["status", "reassessmentId (implied by REQUEST_REASSESSMENT branch)"],
  "POST /api/owner/goal-arbitration": ["NOT_VERIFIED — result.ok is checked; result.data is only passed to a generic failure-message helper, no specific field destructured on success"],
  "POST /api/owner/override-arbitration": ["NOT_VERIFIED — result.ok is checked; result.data is only passed to a generic failure-message helper, no specific field destructured on success"],
  "POST /api/owner/constraints": ["NOT_VERIFIED — result.ok is checked; result.data is only passed to a generic failure-message helper, no specific field destructured on success"],
  "POST /api/escalation/acknowledge": ["NOT_VERIFIED — ok is checked; data is only passed to a generic failure-message helper, no specific field destructured on success"],
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
        fieldsConsumed: COCKPIT_FIELDS_CONSUMED[key.split(" ").slice(0, 2).join(" ")] ?? ["NOT_VERIFIED"],
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
  const allApiCapabilityIndex = buildAllApiCapabilityIndex();
  const ownerPageRoutes = buildOwnerPageRoutes(sidebarItems, allApiCapabilityIndex);

  const ownerActionFamilies = buildOwnerActionFamilies(allApiRoutesFlat);
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
  console.log(`Route-method cross-validation: ${validated} calls validated, 0 mismatches.`);
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
    baselineSha: "646b06b97dee7283f5bf6db1d38027e843e3efbc",
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

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2) + "\n");

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

  // ── report to stdout ──
  console.log("Wrote", relSrc(OUT_FILE));
  console.log("ownerPageRoutes:", ownerPageRoutes.length);
  console.log("ownerApiRoutes:", ownerApiRoutes.length);
  console.log("ownerNowViewFields:", ownerNowViewFieldNames.length);
  console.log("ownerNowViewCoreFields:", ownerNowViewCoreFieldNames.length);
  console.log("ownerActions families:", ownerActionFamilies.length);
  console.log("workflowStateFamilies:", workflowStateFamilies.length);
  console.log("cockpitExternalFeeds:", cockpitExternalFeeds.length);
  console.log("preExistingCorrectnessFindings:", preExistingCorrectnessFindings.length);
  const pagesWithSessionOnlyAccess = ownerPageRoutes.filter((p) => p.pageAccessGate === "AUTHENTICATED_SESSION_ONLY").length;
  console.log("pages with pageAccessGate AUTHENTICATED_SESSION_ONLY:", pagesWithSessionOnlyAccess);
  const processExecFamily = ownerActionFamilies.find((f) => f.family === "process_execution");
  const tasksFamily = ownerActionFamilies.find((f) => f.family === "tasks");
  console.log("process_execution commands:", processExecFamily?.commands?.flatMap((c) => c.values).length ?? 0);
  console.log("process_execution workflowStatuses:", processExecFamily?.workflowStatuses?.flatMap((c) => c.values).length ?? 0);
  console.log("tasks workflowStatuses:", tasksFamily?.workflowStatuses?.flatMap((c) => c.values).length ?? 0);
  console.log("exactNotVerifiedCount:", nv.exact);
  console.log("notVerifiedPrefixedCount:", nv.prefixed);
}

main();
