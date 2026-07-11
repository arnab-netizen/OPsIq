#!/usr/bin/env node
/**
 * Phase R0 — PRISMA_CREATE_SELECT_INTEGRITY scanner
 *
 * Scans TypeScript service files for Prisma select/include calls that reference
 * fields not declared in the Prisma schema. Reports SUSPECTED patterns with
 * file:line for manual review.
 *
 * Usage:
 *   node scripts/scan-prisma-integrity.js [--path src/services]
 *
 * Output: file:line: MODEL.field — SUSPECTED (field not found in schema)
 */

const fs = require("fs");
const path = require("path");

// ── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_SCAN_PATH = path.resolve(__dirname, "../src");
const SCHEMA_PATH = path.resolve(__dirname, "../prisma/schema.prisma");

const scanPath = process.argv.includes("--path")
  ? path.resolve(process.argv[process.argv.indexOf("--path") + 1])
  : DEFAULT_SCAN_PATH;

// ── Parse Prisma schema ───────────────────────────────────────────────────────

function parseSchema(schemaText) {
  const models = {};
  let currentModel = null;

  for (const line of schemaText.split("\n")) {
    const trimmed = line.trim();

    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      models[currentModel] = new Set();
      continue;
    }

    if (trimmed === "}" && currentModel) {
      currentModel = null;
      continue;
    }

    if (currentModel && trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("@@")) {
      const fieldMatch = trimmed.match(/^(\w+)\s+/);
      if (fieldMatch) {
        models[currentModel].add(fieldMatch[1]);
      }
    }
  }

  return models;
}

// ── Build a flat map: field → Set<modelName> ─────────────────────────────────

function buildFieldIndex(models) {
  const index = {};
  for (const [model, fields] of Object.entries(models)) {
    for (const field of fields) {
      if (!index[field]) index[field] = new Set();
      index[field].add(model);
    }
  }
  return index;
}

// ── Scan files ────────────────────────────────────────────────────────────────

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...walkDir(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(full);
    }
  }
  return files;
}

// Extract `select: { fieldA: true, fieldB: true }` patterns
const SELECT_PATTERN = /select\s*:\s*\{([^}]+)\}/g;
// Extract field names from select object: `fieldName: true`
const FIELD_PATTERN = /(\w+)\s*:\s*true/g;

function scanFile(filePath, fieldIndex, models) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const findings = [];

  let match;
  SELECT_PATTERN.lastIndex = 0;

  while ((match = SELECT_PATTERN.exec(content)) !== null) {
    const selectBlock = match[1];
    const matchStart = match.index;

    // Find line number
    const linesBefore = content.slice(0, matchStart).split("\n");
    const lineNum = linesBefore.length;

    // Extract field names from select block
    let fieldMatch;
    FIELD_PATTERN.lastIndex = 0;
    while ((fieldMatch = FIELD_PATTERN.exec(selectBlock)) !== null) {
      const fieldName = fieldMatch[1];

      // Skip well-known meta fields
      if (["id", "createdAt", "updatedAt", "workspaceId"].includes(fieldName)) continue;

      // Check if field exists in ANY model
      if (!fieldIndex[fieldName]) {
        findings.push({
          file: path.relative(path.resolve(__dirname, ".."), filePath),
          line: lineNum,
          field: fieldName,
          context: lines[lineNum - 1]?.trim() ?? "",
        });
      }
    }
  }

  return findings;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Schema not found at ${SCHEMA_PATH}`);
    process.exit(1);
  }

  const schemaText = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const models = parseSchema(schemaText);
  const fieldIndex = buildFieldIndex(models);

  console.log(`Loaded ${Object.keys(models).length} models from schema`);
  console.log(`Scanning: ${scanPath}\n`);

  const files = walkDir(scanPath);
  const allFindings = [];

  for (const file of files) {
    try {
      const findings = scanFile(file, fieldIndex, models);
      allFindings.push(...findings);
    } catch {
      // skip unreadable files
    }
  }

  if (allFindings.length === 0) {
    console.log("CLEAN — no phantom field references found in select blocks.");
    process.exit(0);
  }

  console.log(`SUSPECTED phantom field references (${allFindings.length}):\n`);
  for (const f of allFindings) {
    console.log(`  ${f.file}:${f.line}: field "${f.field}" not in any schema model`);
    console.log(`    context: ${f.context}\n`);
  }

  process.exit(1);
}

main();
