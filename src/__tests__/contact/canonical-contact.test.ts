/**
 * Owner-confirmed fact: contact.us@opsiq.solutions is the ONLY authorized OpsIQ contact mailbox; support@opsiq.solutions
 * does not exist. This guards every active customer-facing surface against the unauthorized address coming back and
 * against new hard-coded contact addresses bypassing the single shared constant.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(name)) out.push(p);
  }
  return out;
}

const isTest = (p: string) => /__tests__|__ignored_tests__|\.test\.|\.spec\./.test(p);
const appFiles = walk(join(ROOT, "src")).filter((p) => !isTest(p));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("canonical contact address", () => {
  it("is exactly the owner-confirmed mailbox and a matching mailto", () => {
    expect(CONTACT_EMAIL).toBe("contact.us@opsiq.solutions");
    expect(CONTACT_MAILTO).toBe("mailto:contact.us@opsiq.solutions");
  });

  it("no active application code, page, metadata or service contains support@opsiq.solutions", () => {
    const offenders = appFiles.filter((f) => /support@opsiq/i.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("the canonical address is hard-coded in exactly one active source file", () => {
    const holders = appFiles.filter((f) => readFileSync(f, "utf8").includes("contact.us@opsiq.solutions")).map((f) => relative(ROOT, f));
    expect(holders).toEqual(["src/lib/contact.ts"]);
  });

  it("every customer-facing surface that shows a contact address reads the shared constant", () => {
    const surfaces = [
      "src/components/landing/PublicSiteFooter.tsx",
      "src/app/privacy/page.tsx",
      "src/app/terms/page.tsx",
      "src/app/pricing/page.tsx",
      "src/app/refund-policy/page.tsx",
      "src/app/beta/page.tsx",
      "src/app/error.tsx",
      "src/app/global-error.tsx",
      "src/app/(authenticated)/settings/page.tsx",
      "src/services/export.ts",
    ];
    for (const f of surfaces) {
      const src = read(f);
      expect(src, f).toMatch(/from "@\/lib\/contact"/);
      expect(src, f).toMatch(/CONTACT_(EMAIL|MAILTO)/);
      expect(src, f).not.toMatch(/mailto:\s*[A-Za-z0-9._%+-]+@/);
    }
  });

  it("no active source hard-codes any other @opsiq.solutions mailbox", () => {
    const offenders: string[] = [];
    for (const f of appFiles) {
      for (const m of readFileSync(f, "utf8").matchAll(/[A-Za-z0-9._%+-]+@opsiq\.solutions/g)) {
        if (m[0] !== "contact.us@opsiq.solutions") offenders.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("current operating and policy documents name the canonical mailbox, not the unauthorized one", () => {
    for (const f of ["SECURITY.md", "CODE_OF_CONDUCT.md", "docs/support/SUPPORT.md"]) {
      const src = read(f);
      expect(src, f).toMatch(/contact\.us@opsiq\.solutions/);
      expect(src, f).not.toMatch(/support@opsiq/i);
    }
  });
});

import { generateGDPRExportMetadata } from "@/services/export";

describe("data export notice", () => {
  it("supplies the canonical contact address in the GDPR export package", () => {
    const parsed = JSON.parse(generateGDPRExportMetadata("workspace-123"));
    expect(parsed.contact).toBe("contact.us@opsiq.solutions");
  });
});
