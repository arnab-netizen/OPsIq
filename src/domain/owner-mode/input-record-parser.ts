/**
 * Owner input RECORD PARSER — the single, pure validation/classification seam shared by every real
 * input path (manual entry, structured/upload-ready import, and provider-backed ingestion).
 *
 * It validates ONE structured record against a workspace+business scope, rejects malformed records,
 * rejects cross-workspace and cross-business records, classifies the data category, and returns a
 * normalized payload. There is exactly one definition of "what a valid owner input record is" — manual
 * and import paths both call this, so they cannot diverge.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import { OWNER_INPUT_CATEGORIES, type OwnerInputCategory } from "@/domain/owner-mode/input-catalog";

export type InputSource = "manual" | "import" | "provider";
export const INPUT_SOURCES: readonly InputSource[] = ["manual", "import", "provider"] as const;

export interface OwnerInputRecord {
  workspaceId: string;
  businessId: string;
  category: OwnerInputCategory;
  source: InputSource;
  fields: Record<string, number | string | boolean | null>;
  capturedAtISO?: string;
}

export interface ParsedInputOk {
  ok: true;
  workspaceId: string;
  businessId: string;
  category: OwnerInputCategory;
  source: InputSource;
  normalizedFields: Record<string, number | string>;
  rowCount: number;
}

export interface ParsedInputError {
  ok: false;
  errors: string[];
  /** Distinguishes a scope-isolation rejection from a malformed-record rejection. */
  rejection: "malformed" | "cross_workspace" | "cross_business";
}

export type ParseResult = ParsedInputOk | ParsedInputError;

/** Keys whose value represents a money/quantity amount — these may not be negative. */
function isAmountKey(key: string): boolean {
  return /revenue|cost|cash|payroll|expense|spend|debt|emi|amount|balance|price|fee|payable|receivable|count|qty|quantity|hours|minutes/i.test(key);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse + validate a single owner input record against the caller's verified scope.
 * The scope (workspaceId, businessId) is the authority; a record that disagrees is rejected as a
 * cross-scope attempt rather than silently re-homed.
 */
export function parseInputRecord(raw: unknown, scope: { workspaceId: string; businessId: string }): ParseResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ["record must be an object"], rejection: "malformed" };
  }
  const rec = raw as Partial<OwnerInputRecord>;

  // Scope isolation FIRST — never accept a record addressed to another workspace/business.
  if (typeof rec.workspaceId !== "string" || rec.workspaceId !== scope.workspaceId) {
    return { ok: false, errors: ["record workspaceId does not match the authenticated workspace"], rejection: "cross_workspace" };
  }
  if (typeof rec.businessId !== "string" || rec.businessId !== scope.businessId) {
    return { ok: false, errors: ["record businessId does not match the selected business"], rejection: "cross_business" };
  }

  // Category classification.
  if (typeof rec.category !== "string" || !(OWNER_INPUT_CATEGORIES as readonly string[]).includes(rec.category)) {
    errors.push("unknown or missing data category");
  }
  // Source.
  if (typeof rec.source !== "string" || !(INPUT_SOURCES as readonly string[]).includes(rec.source)) {
    errors.push("unknown or missing source");
  }
  // Fields.
  if (!isObject(rec.fields)) {
    errors.push("fields must be an object");
  }

  const normalizedFields: Record<string, number | string> = {};
  if (isObject(rec.fields)) {
    for (const [k, v] of Object.entries(rec.fields)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "number") {
        if (!Number.isFinite(v)) {
          errors.push(`field "${k}" is not a finite number`);
          continue;
        }
        if (isAmountKey(k) && v < 0) {
          errors.push(`field "${k}" cannot be negative`);
          continue;
        }
        normalizedFields[k] = v;
      } else if (typeof v === "boolean") {
        normalizedFields[k] = v ? "true" : "false";
      } else if (typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed.length === 0) continue;
        normalizedFields[k] = trimmed;
      } else {
        errors.push(`field "${k}" has an unsupported type`);
      }
    }
  }

  if (Object.keys(normalizedFields).length === 0) {
    errors.push("record has no usable field values");
  }
  if (rec.capturedAtISO !== undefined && (typeof rec.capturedAtISO !== "string" || Number.isNaN(Date.parse(rec.capturedAtISO)))) {
    errors.push("capturedAtISO is not a valid ISO date");
  }

  if (errors.length > 0) {
    return { ok: false, errors, rejection: "malformed" };
  }

  return {
    ok: true,
    workspaceId: scope.workspaceId,
    businessId: scope.businessId,
    category: rec.category as OwnerInputCategory,
    source: rec.source as InputSource,
    normalizedFields,
    rowCount: 1,
  };
}

/** Map a stored intake targetDomain back to an owner category (identity for our category-keyed intakes). */
export function intakeDomainToCategory(targetDomain: string | null | undefined): OwnerInputCategory | null {
  if (typeof targetDomain === "string" && (OWNER_INPUT_CATEGORIES as readonly string[]).includes(targetDomain)) {
    return targetDomain as OwnerInputCategory;
  }
  return null;
}
