/**
 * Intuit / QuickBooks user-data boundary: QuickBooks-derived data must not reach analytics, session recording, error tracking, e-mail,
 * billing, advertising / marketing or AI providers. These are CODE-LEVEL proofs of the data flow (what each processor can be handed),
 * not statements about vendor contracts. A processor that receives data only to run OpsIQ for the customer is a service provider and
 * is classified separately from a sale; nothing here classifies any of them as a recipient of QuickBooks data.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { scrubEvent, scrubIntuitText, isIntuitBreadcrumb } from "@/infra/observability";
import { MockAiProvider, excludeIntuitData, type AiContext } from "@/services/ai/provider";
import { runMissingQuestionTask } from "@/services/ai/copilot";
import { isClarityEligiblePath, CLARITY_FORBIDDEN_PREFIXES } from "@/lib/analytics/clarity-policy";
import { filterPublicPageView } from "@/lib/analytics/public-page-analytics";

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "__tests__" || n === "generated" || n === "node_modules") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const src = walk(join(ROOT, "src"));
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p: string) => readFileSync(p, "utf8");
const QBO_REF = /quickbooks|\bqbo\b|qbo-|owner-finance|owner-cashflow|owner-budget|privacy-erasure|intuit/i;
const filesUnder = (...prefixes: string[]) => src.filter((f) => prefixes.some((p) => rel(f).startsWith(p)));
// Reviewed non-data references: the Intuit exclusion guard itself, and the budget module\'s system-actor id helper (an actor id, no figures).
const ALLOWED = /.*(excludeIntuitData|dataOrigins|Declared origins|Intuit user data|\.test\(o\)|owner-budget\/system-actor).*/g;
const offenders = (files: string[], re = QBO_REF) => files.filter((f) => re.test(read(f).replace(ALLOWED, ""))).map(rel);

describe("Intuit data boundary: error tracking (Sentry)", () => {
  it("redacts Intuit URLs and company ids from every string in an event and drops Intuit breadcrumbs", () => {
    const url = "https://quickbooks.api.intuit.com/v3/company/9130357992278276/reports/ProfitAndLoss?minorversion=70";
    const ev = scrubEvent({
      message: `failed ${url}`,
      exception: { values: [{ value: `GET ${url} -> 500 /company/9130357992278276` }] },
      request: { url: "https://opsiq.solutions/api/x", cookies: "a=b", data: { x: 1 }, headers: { cookie: "c" } },
      breadcrumbs: [{ category: "fetch", data: { url } }, { category: "console", message: "hello" }],
      extra: { note: `see ${url}` },
    });
    const json = JSON.stringify(ev);
    expect(json).not.toMatch(/9130357992278276|intuit\.com/);
    expect((ev.breadcrumbs as unknown[]).length).toBe(1);
    expect(scrubIntuitText("x /company/12345678 y")).toBe("x /company/[realm] y");
    expect(isIntuitBreadcrumb({ data: { url } })).toBe(true);
    expect(isIntuitBreadcrumb({ message: "hi" })).toBe(false);
  });
  it("Sentry init never sends default PII and sets the breadcrumb filter", () => {
    const code = read(join(ROOT, "src/infra/observability.ts"));
    expect(code).toMatch(/sendDefaultPii:\s*false/);
    expect(code).toMatch(/beforeBreadcrumb/);
    expect(code).toMatch(/tracesSampleRate:\s*0/);
  });
});

describe("Intuit data boundary: AI providers", () => {
  const ctx = (origins?: string[]): AiContext => ({ workspaceId: "w", taskType: "MISSING_QUESTION_GENERATION", riskLevel: "LOW_CONTENT", items: [], allowedEvidenceIds: [], gates: {}, dataOrigins: origins });
  it("a context that declares a QuickBooks origin is never handed to the provider", async () => {
    let called = 0;
    const spy = new MockAiProvider({ kind: "valid", raw: {} });
    const orig = spy.generate.bind(spy);
    spy.generate = async () => { called++; return orig(); };
    expect(excludeIntuitData(spy, ctx(["QUICKBOOKS"])).name).toBe("unavailable");
    expect(excludeIntuitData(spy, ctx(["intuit_report"])).name).toBe("unavailable");
    expect(excludeIntuitData(spy, ctx(["owner_text"])).name).toBe("mock");
    const r = await runMissingQuestionTask(spy, ctx(["QUICKBOOKS"]));
    expect(r.status).toBe("AI_UNAVAILABLE");
    expect(called).toBe(0);
  });
  it("no AI module and no AI caller can import QuickBooks / finance / cashflow / budget data", () => {
    expect(offenders(filesUnder("src/services/ai/"))).toEqual([]);
    expect(offenders(["src/app/api/decisions/intake/route.ts"].map((f) => join(ROOT, f)))).toEqual([]);
  });
  it("the AI provider is resolved from exactly one product call site (a new one must be reviewed here)", () => {
    const callers = src.filter((f) => !rel(f).startsWith("src/services/ai/") && /resolveAiProvider|openai-provider|anthropic-provider/.test(read(f))).map(rel);
    expect(callers).toEqual(["src/app/api/decisions/intake/route.ts"]);
  });
});

describe("Intuit data boundary: analytics, session recording, e-mail, billing, marketing, logs", () => {
  it("analytics code contains no QuickBooks reference; Clarity and Vercel Analytics are public-page-only", () => {
    expect(offenders(filesUnder("src/lib/analytics/", "src/components/analytics/"))).toEqual([]);
    for (const p of ["/owner", "/owner/finance", "/owner/integrations/quickbooks", "/dashboard", "/api/owner/integrations/quickbooks/callback"]) {
      expect(isClarityEligiblePath(p), p).toBe(false);
      expect(filterPublicPageView({ url: `https://opsiq.solutions${p}` }), p).toBeNull();
    }
    expect(CLARITY_FORBIDDEN_PREFIXES).toEqual(expect.arrayContaining(["/owner", "/admin", "/api", "/dashboard"]));
  });
  it("every module that sends e-mail (Resend) is free of QuickBooks / finance data", () => {
    const mailers = src.filter((f) => /email-provider|api\.resend\.com/.test(read(f)));
    expect(mailers.length).toBeGreaterThan(0);
    expect(offenders(mailers)).toEqual([]);
  });
  it("billing (Paddle) code is free of QuickBooks / finance data", () => {
    expect(offenders(filesUnder("src/services/billing/", "src/lib/billing/", "src/domain/billing/", "src/components/billing/"))).toEqual([]);
  });
  it("no advertising / marketing / session-replay SDK is a dependency", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json")));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /segment|mixpanel|posthog|hotjar|amplitude|fullstory|logrocket|facebook|pixel|gtag|google-analytics|intercom|hubspot|mailchimp|braze|customer\.io/i.test(d))).toEqual([]);
  });
  it("QuickBooks code writes nothing to console (logs go through the structured logger, which carries ids and counts only)", () => {
    expect(offenders(filesUnder("src/services/quickbooks/", "src/domain/quickbooks/", "src/services/privacy-erasure/"), /console\.(log|info|warn|error|debug)/)).toEqual([]);
  });
});
