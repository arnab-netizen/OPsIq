/**
 * Shared test fixture: a resolver input with NO persisted change facts ("what changed" is empty).
 * Tests that exercise "what changed" build their own OwnerChangeFacts.
 */
import type { OwnerChangeFacts } from "@/domain/owner-spine/owner-decision";

export const NO_CHANGE_FACTS: OwnerChangeFacts = Object.freeze({
  since: new Date(0),
  transitions: [],
  events: [],
  recordIssues: [],
  attribution: null,
  newlyStaleDomains: [],
});
