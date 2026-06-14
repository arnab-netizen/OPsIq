/**
 * Generate contracts/business-facts.schema.json from the Zod source of truth
 * (src/domain/business-facts/contract.ts) so the machine-readable JSON Schema
 * can never drift from the validating Zod definition.
 *
 * Usage:
 *   npx tsx scripts/generate-business-facts-schema.ts          # write file
 *   npx tsx scripts/generate-business-facts-schema.ts --check  # exit 1 if stale
 *
 * Note: JSON Schema captures the STRUCTURAL contract. Cross-field referential
 * rules (currency-if-financial, unique fact_id, dangling-ref checks) live in the
 * Zod `.refine()`s and are documented in contracts/business-facts.version.md.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod/v4";
import {
  businessFactsContractStructuralSchema,
  BUSINESS_FACTS_SCHEMA_VERSION,
} from "../src/domain/business-facts/contract";

const OUTPUT_PATH = resolve(__dirname, "../contracts/business-facts.schema.json");

export function buildJsonSchema(): string {
  const jsonSchema = z.toJSONSchema(businessFactsContractStructuralSchema, {
    target: "draft-2020-12",
  }) as Record<string, unknown>;

  const doc = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://opsiq.local/contracts/business-facts.schema.json",
    title: "OpsIQ Business Facts Contract",
    description:
      "Canonical machine-readable business-facts contract (B01). Structural schema " +
      "generated from the Zod source of truth. Cross-field referential rules are " +
      "enforced by the Zod schema and documented in business-facts.version.md.",
    "x-contract-version": BUSINESS_FACTS_SCHEMA_VERSION,
    ...jsonSchema,
  };

  return JSON.stringify(doc, null, 2) + "\n";
}

function main(): void {
  const content = buildJsonSchema();
  const check = process.argv.includes("--check");

  if (check) {
    if (!existsSync(OUTPUT_PATH)) {
      console.error("business-facts.schema.json missing; run the generator.");
      process.exit(1);
    }
    const current = readFileSync(OUTPUT_PATH, "utf8");
    if (current !== content) {
      console.error("business-facts.schema.json is STALE; regenerate it.");
      process.exit(1);
    }
    console.log("business-facts.schema.json is up to date.");
    return;
  }

  writeFileSync(OUTPUT_PATH, content, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

// Only run when invoked directly, not when imported by a test.
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main();
}
