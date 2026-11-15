/**
 * Server-log hygiene for the governed technical detail used by signup/first-run failure logs.
 * Root cause: extractTechnicalDetails logged raw message + stack, so a Prisma "Invalid invocation" message that echoes
 * the written row put owners' emails / business names (and any token in a message) into logs.
 */
import { describe, it, expect } from "vitest";
import { classifyOperatorError, scrubLogText } from "@/lib/operator-error-governance";

describe("scrubLogText", () => {
  it("masks emails, URLs with credentials, bearer tokens, key=value secrets and long hex tokens", () => {
    const raw = 'Invalid `prisma.user.create()` invocation: email: "owner@harbour-laundry.com" postgres://u:pw@h/db Bearer abcdef1234567890 password=hunter2 ' + "a".repeat(64);
    const out = scrubLogText(raw);
    expect(out).not.toMatch(/owner@|harbour|u:pw|abcdef1234567890|hunter2|a{40}/);
    expect(out).toContain("prisma.user.create()");
    expect(out).toContain("[email]");
  });
  it("keeps ordinary diagnostic text intact", () => {
    expect(scrubLogText("Unique constraint failed on the fields: (`id`)")).toBe("Unique constraint failed on the fields: (`id`)");
  });
});

describe("classifyOperatorError technicalDetails", () => {
  it("is scrubbed but keeps the error name and a stack", () => {
    const e = new Error("write failed for owner@example.com");
    e.name = "PrismaClientKnownRequestError";
    const d = classifyOperatorError(e, { context: "load" }).technicalDetails;
    expect(d).toContain("PrismaClientKnownRequestError");
    expect(d).toContain("write failed for [email]");
    expect(d).not.toContain("owner@example.com");
    expect(JSON.parse(d).stack).toContain("Error");
  });
});
