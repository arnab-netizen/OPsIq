import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  QboBeginAuthorizationSchema, QboConsumeStateSchema, QboReauthSchema, QboRotateSchema, QBO_CONNECTION_STATUS,
} from "@/domain/quickbooks/qbo-connection-model";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { WORKSPACE_OWNED_MODELS } from "@/lib/prisma-workspace-enforcement";

const U = "11111111-1111-4111-8111-111111111111";
const migration = readFileSync(join(process.cwd(), "prisma/migrations/20261008090000_qbo_connection_tenancy_persistence/migration.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/services/quickbooks/qbo-connection.service.ts"), "utf8");

describe("QBO connection input contracts", () => {
  it("environment is explicit and closed; ids are uuids", () => {
    expect(QboBeginAuthorizationSchema.safeParse({ workspaceId: U, actorId: U, businessId: U, environment: "sandbox" }).success).toBe(true);
    expect(QboBeginAuthorizationSchema.safeParse({ workspaceId: U, actorId: U, businessId: U }).success).toBe(false);
    expect(QboBeginAuthorizationSchema.safeParse({ workspaceId: U, actorId: U, businessId: U, environment: "prod" }).success).toBe(false);
    expect(QboBeginAuthorizationSchema.safeParse({ workspaceId: "x", actorId: U, businessId: U, environment: "sandbox" }).success).toBe(false);
    expect(QboConsumeStateSchema.safeParse({ workspaceId: U, actorId: U, environment: "production", state: "" }).success).toBe(false);
    expect(QboReauthSchema.safeParse({ workspaceId: U, connectionId: U, reasonCode: "a b" }).success).toBe(false);
    expect(QboRotateSchema.safeParse({ workspaceId: U, connectionId: U, expectedRevision: 0 }).success).toBe(false);
  });
  it("lifecycle vocabulary matches the DB CHECK", () => {
    for (const s of Object.values(QBO_CONNECTION_STATUS)) expect(migration).toContain(`'${s}'`);
  });
  it("audit events and tenant registry are wired", () => {
    expect(AUDIT_EVENTS.QBO_REALM_BINDING_CONFLICT).toBe("qbo.realm_binding_conflict");
    for (const m of ["QboOAuthState", "QboConnection", "QboConnectionToken"]) expect(WORKSPACE_OWNED_MODELS.has(m)).toBe(true);
  });
});

describe("migration + service source contracts", () => {
  it("is additive only and encodes the tenancy invariants", () => {
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(migration).not.toMatch(/ALTER TABLE "(?!qbo_)/);
    expect(migration).toContain('"qbo_connections_live_realm_key" ON "qbo_connections"("environment", "realm_id") WHERE "status" <> \'DISCONNECTED\'');
    expect(migration).toContain('REFERENCES "owner_businesses"("id", "workspace_id")');
    expect(migration).toContain("'^[0-9a-f]{64}$'");
    expect(migration).toContain("LIKE 'v1gcm.%'");
  });
  it("reuses shared crypto and never logs or interpolates secrets", () => {
    expect(service).toContain("encryptOAuthToken");
    expect(service).toContain("decryptOAuthToken");
    expect(service).not.toMatch(/console\.|logger\./);
    expect(service).not.toMatch(/createCipheriv|createDecipheriv/);
  });
});
