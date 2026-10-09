import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { QBO_CONNECT_FAILURE_CODES, mapConnectFailure, classifyProviderDenial } from "@/domain/quickbooks/qbo-connect-outcomes";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const connect = code(read("src/app/api/owner/integrations/quickbooks/connect/route.ts"));
const callback = code(read("src/app/api/owner/integrations/quickbooks/callback/route.ts"));
const service = code(read("src/services/quickbooks/qbo-connect-callback.service.ts"));

describe("public outcome table", () => {
  it("every code maps to a fixed sentence; nothing dynamic can enter the body", () => {
    for (const c of QBO_CONNECT_FAILURE_CODES) {
      const m = mapConnectFailure(c);
      expect(Object.keys(m.body).sort()).toEqual(["code", "message", "retry", "status"]);
      expect(m.httpStatus).toBeGreaterThanOrEqual(400);
      expect(m.body.message).not.toMatch(/\$\{|undefined|workspace|tenant/i);
    }
  });
  it("the provider error query value collapses to a closed set", () => {
    expect(classifyProviderDenial("access_denied")).toBe("access_denied");
    expect(classifyProviderDenial("<script>x</script>")).toBe("OTHER");
    expect(classifyProviderDenial(undefined)).toBe("OTHER");
  });
});

describe("source contracts", () => {
  it("routes derive workspace and actor only from the verified context", () => {
    for (const src of [connect, callback]) {
      expect(src).toMatch(/ctx\.verifiedWorkspaceId/);
      expect(src).toMatch(/ctx\.verifiedActorId/);
      expect(src).not.toMatch(/searchParams\.get\(\s*["'](workspaceId|actorId|businessId|environment|returnTo|redirect)/);
      expect(src).not.toMatch(/headers\.get|cookies\(|NextResponse\.redirect|Location|redirect\(/i);
      expect(src).not.toMatch(/console\.|logger\./);
      expect(src).toMatch(/requireCapabilities: \[CAPABILITIES\.OWNER_MANAGE\]/);
    }
  });
  it("the callback consumes the state before it can reach the token exchange, and never reads tenancy from the query", () => {
    expect(service.indexOf("consumeQboAuthorizationState(")).toBeGreaterThan(-1);
    expect(service.indexOf("consumeQboAuthorizationState(")).toBeLessThan(service.indexOf("exchangeQboAuthorizationCode("));
    expect(service.indexOf("exchangeQboAuthorizationCode(")).toBeLessThan(service.indexOf("finalizeQboConnection("));
    expect(service).not.toMatch(/single\(\s*query,\s*["'](workspaceId|actorId|businessId|environment|returnTo|redirect)/);
    expect(service).not.toMatch(/console\.|logger\.|process\.env/);
  });
  it("adds no schema, migration or persistence module", () => {
    expect(service).not.toMatch(/@\/lib\/db|prisma|\$transaction/);
  });
});
