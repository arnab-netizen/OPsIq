import { describe, it, expect } from "vitest";
import { InvalidStateTransitionError } from "@/infra/errors";
import {
  assertInitiativeClosable,
  isTerminalInitiativeStatus,
  TERMINAL_INITIATIVE_STATUSES,
  type StartupInitiativeStatus,
} from "@/domain/owner-strategy/startup-initiative-lifecycle";

describe("startup-initiative-lifecycle — assertInitiativeClosable", () => {
  it("allows ACTIVE -> COMPLETED", () => {
    expect(() => assertInitiativeClosable("ACTIVE", "COMPLETED")).not.toThrow();
  });

  it("allows ACTIVE -> CANCELLED", () => {
    expect(() => assertInitiativeClosable("ACTIVE", "CANCELLED")).not.toThrow();
  });

  it("rejects closing an already-COMPLETED initiative", () => {
    expect(() => assertInitiativeClosable("COMPLETED", "COMPLETED")).toThrow(InvalidStateTransitionError);
  });

  it("rejects closing an already-CANCELLED initiative", () => {
    expect(() => assertInitiativeClosable("CANCELLED", "COMPLETED")).toThrow(InvalidStateTransitionError);
  });

  it("rejects closing a SUPERSEDED initiative", () => {
    expect(() => assertInitiativeClosable("SUPERSEDED", "CANCELLED")).toThrow(InvalidStateTransitionError);
  });

  it("rejects closing a PAUSED initiative (no writer resumes it to ACTIVE yet)", () => {
    expect(() => assertInitiativeClosable("PAUSED", "COMPLETED")).toThrow(InvalidStateTransitionError);
  });

  it("error message names both the from and to states", () => {
    let message = "";
    try {
      assertInitiativeClosable("COMPLETED", "CANCELLED");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("COMPLETED");
    expect(message).toContain("CANCELLED");
    expect(message).toContain("StartupInitiative");
  });
});

describe("startup-initiative-lifecycle — isTerminalInitiativeStatus", () => {
  it("COMPLETED, CANCELLED, and SUPERSEDED are terminal", () => {
    expect(isTerminalInitiativeStatus("COMPLETED")).toBe(true);
    expect(isTerminalInitiativeStatus("CANCELLED")).toBe(true);
    expect(isTerminalInitiativeStatus("SUPERSEDED")).toBe(true);
  });

  it("ACTIVE and PAUSED are not terminal", () => {
    expect(isTerminalInitiativeStatus("ACTIVE")).toBe(false);
    expect(isTerminalInitiativeStatus("PAUSED")).toBe(false);
  });

  it("TERMINAL_INITIATIVE_STATUSES contains exactly the three terminal statuses", () => {
    expect(TERMINAL_INITIATIVE_STATUSES.size).toBe(3);
    const expected: StartupInitiativeStatus[] = ["COMPLETED", "CANCELLED", "SUPERSEDED"];
    for (const s of expected) {
      expect(TERMINAL_INITIATIVE_STATUSES.has(s)).toBe(true);
    }
  });
});
