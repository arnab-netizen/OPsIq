/**
 * Stage 7 — an observation never carries a database connection string, masked or not.
 *
 * A captured test log line `Database URL: postgresql:***@<host>/<db>?sslmode=require` is a connection string with only
 * the credentials masked: it still names the target. The artifact attestation says no connection string appears, so
 * capture now refuses such an observation (prospective). The signed-artifact validator and REDACTION_PATTERNS are
 * unchanged, so every historical artifact still validates.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module without type declarations
import { CONNECTION_STRING_PATTERNS, REDACTION_PATTERNS, REDACTION_SCANNER_ID, scanForConnectionStrings } from "../../../scripts/lib/evidence-artifact.mjs";

const scan = scanForConnectionStrings as (text: string) => string[];
const HOST = "ep-example-host-000000.example.invalid";

describe("scanForConnectionStrings", () => {
  it("flags a credential-masked connection string", () => {
    expect(scan(`Database URL: postgresql:***@${HOST}/neondb?sslmode=require`)).toContain(
      "database_connection_string_masked_or_credentialed",
    );
  });
  it("flags a credentialed connection string", () => {
    expect(scan(`postgresql://user:pw@${HOST}/db`)).toContain("database_connection_string_masked_or_credentialed");
  });
  it("flags a credential-free connection string", () => {
    expect(scan(`postgresql://${HOST}/db`)).toContain("database_connection_string_without_credentials");
  });
  it("does not flag presence-only or sanitized lines", () => {
    expect(scan('Datasource "db": PostgreSQL database "neondb" at "<redacted-host>"')).toEqual([]);
    expect(scan("Database URL: configured (not printed)")).toEqual([]);
    expect(scan("")).toEqual([]);
  });
  it("never returns the matched text", () => {
    const ids = scan(`postgresql:***@${HOST}/db`);
    expect(JSON.stringify(ids)).not.toContain(HOST);
  });
});

describe("historical artifact compatibility", () => {
  it("keeps the redaction scanner identity and pattern set unchanged", () => {
    expect(REDACTION_SCANNER_ID).toBe(`evidence-redaction-scan@${REDACTION_PATTERNS.length}`);
    expect(REDACTION_SCANNER_ID).toBe("evidence-redaction-scan@14");
    const ids = REDACTION_PATTERNS.map((p: { id: string }) => p.id);
    for (const p of CONNECTION_STRING_PATTERNS as { id: string }[]) expect(ids).not.toContain(p.id);
  });
  it("wires the check into capture before anything is written", () => {
    const source = readFileSync(join(process.cwd(), "scripts/capture-evidence.mjs"), "utf8");
    expect(source).toMatch(/scanForConnectionStrings\(rawObservation\)/);
    expect(source).toMatch(/refuse\(3,[^)]*connection string/);
    expect(source.indexOf("scanForConnectionStrings(rawObservation)")).toBeLessThan(source.indexOf("OPTION A authorization gate"));
  });
});
