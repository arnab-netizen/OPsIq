/**
 * B02-S3 File-Intake Persistence Bridge.
 *
 * Bridges the B02 file-intake domain (B02-S1 safe file handling + B02-S2 column
 * mapping preview) INTO the proven Module 10 intake persistence/confirmation flow
 * (`createDataIntake` / `confirmDataIntake`). It does NOT introduce a second
 * persistence path or a second confirmation flow — Module 10 remains the single
 * authority for normalization, persistence, validity, and owner confirmation.
 *
 * What this bridge adds that Module 10 does not do on its own:
 *   1. File-level validation (extension / MIME / size) — B02-S1.
 *   2. RFC-4180 parse + FAIL-CLOSED formula-injection gate — B02-S1. Module 10's
 *      `buildCsvIntake` trusts the CSV text; this gate refuses to persist a file
 *      that carries spreadsheet/command-injection payloads (§37.15).
 *   3. A non-blocking column-mapping PREVIEW (detected domain, confidence,
 *      unmapped columns) for the owner — B02-S2. Persistence normalization still
 *      belongs to Module 10's engine; the preview never drives persistence.
 *
 * After this bridge persists a candidate, confirmation is the EXISTING
 * `confirmDataIntake` (fail-closed on invalid, duplicate-confirm rejected,
 * workspace-isolated, audited). No confirmation logic is duplicated here.
 */
import { validateFileUpload } from "@/domain/file-intake/file-validator";
import { parseCSV } from "@/domain/file-intake/csv-parser";
import { analyzeColumnMapping, type ColumnMappingAnalysis } from "@/domain/file-intake/column-mapper";
import type { IntakeTargetDomain } from "@/domain/owner-intake/field-specs";
import type { IntakeUploadInput } from "@/domain/owner-intake/validation";

/** Domains the B02-S2 column mapper can preview (subset of intake target domains). */
const PREVIEWABLE_DOMAINS = new Set(["finance", "sales", "operations", "marketing"]);

export interface PersistFileIntakeInput {
  businessId: string;
  workspaceId: string;
  actorId: string;
  targetDomain: IntakeTargetDomain;
  filename: string;
  fileSizeBytes: number;
  mimeType?: string;
  /** Raw CSV text already read from the uploaded file. */
  fileContent: string;
  notes?: string;
}

export type PersistFileIntakeResult =
  | {
      ok: true;
      /** The Module 10 OwnerDataIntake candidate (always unconfirmed draft). */
      intake: { id: string; validationStatus: string; ownerConfirmed: boolean };
      /** Non-blocking B02-S2 preview, when the domain is previewable. */
      mappingPreview: ColumnMappingAnalysis | null;
    }
  | {
      ok: false;
      code:
        | "FILE_VALIDATION_FAILED"
        | "CSV_PARSE_FAILED"
        | "FORMULA_INJECTION_BLOCKED"
        | "EMPTY_CONTENT";
      message: string;
      errors?: Array<{ code: string; message: string }>;
      /** Formula-injection alerts when blocked for that reason (safe display values). */
      injectionAlerts?: Array<{ rowNumber: number; columnName: string; safe_display_value: string }>;
    };

/**
 * Run the B02 safe-file pre-flight, then persist via the proven Module 10 path.
 *
 * Fails closed before any DB write on: bad file type/size, unparseable CSV, or
 * detected formula-injection payloads. On success, returns the Module 10
 * unconfirmed candidate plus a non-blocking mapping preview. Confirmation is the
 * caller's separate step via the existing `confirmDataIntake`.
 */
export async function persistFileIntake(
  input: PersistFileIntakeInput
): Promise<PersistFileIntakeResult> {
  if (!input.fileContent || input.fileContent.trim().length === 0) {
    return { ok: false, code: "EMPTY_CONTENT", message: "Uploaded file has no content." };
  }

  // 1. B02-S1 file-level validation (extension / MIME / size). Fail closed.
  const validation = validateFileUpload(input.filename, input.fileSizeBytes, input.mimeType);
  if (!validation.ok) {
    return {
      ok: false,
      code: "FILE_VALIDATION_FAILED",
      message: "File failed upload validation.",
      errors: validation.errors,
    };
  }

  // 2. B02-S1 RFC-4180 parse. Fail closed on malformed CSV.
  const parsed = parseCSV(input.fileContent);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "CSV_PARSE_FAILED",
      message: "File could not be parsed as CSV.",
      errors: parsed.errors,
    };
  }

  // 3. B02-S1 formula-injection gate. Fail closed — never persist tainted cells.
  if (parsed.formulaInjectionDetected && parsed.formulaInjectionDetected.length > 0) {
    return {
      ok: false,
      code: "FORMULA_INJECTION_BLOCKED",
      message:
        "File contains spreadsheet/command-injection payloads and was not persisted. " +
        "Remove leading =, +, -, @, |, or ; from the flagged cells and re-upload.",
      injectionAlerts: parsed.formulaInjectionDetected.map((a) => ({
        rowNumber: a.rowNumber,
        columnName: a.columnName,
        safe_display_value: a.safe_display_value,
      })),
    };
  }

  // 4. B02-S2 non-blocking mapping preview (owner-facing; never drives persistence).
  const mappingPreview =
    parsed.headers && PREVIEWABLE_DOMAINS.has(input.targetDomain)
      ? analyzeColumnMapping(
          parsed.headers,
          input.targetDomain as "finance" | "sales" | "operations" | "marketing"
        )
      : null;

  // 5. Bridge to the proven Module 10 persistence path. Module 10 owns parsing,
  //    normalization, validity classification, persistence, and audit emission.
  const { createDataIntake } = await import("@/services/owner-intake/intake.service");
  const uploadInput: IntakeUploadInput = {
    source: "csv_upload",
    targetDomain: input.targetDomain,
    csvText: input.fileContent,
    ...(input.notes ? { notes: input.notes } : {}),
  };

  const intake = await createDataIntake(
    input.businessId,
    uploadInput,
    input.actorId,
    input.workspaceId
  );

  return {
    ok: true,
    intake: {
      id: intake.id,
      validationStatus: intake.validationStatus,
      ownerConfirmed: intake.ownerConfirmed,
    },
    mappingPreview,
  };
}
