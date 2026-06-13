/**
 * Owner Connectors & Data Intake (Module 10) — deterministic CSV parser.
 *
 * Pure, dependency-free. Handles quoted fields (commas + newlines inside quotes),
 * escaped double-quotes (""), CRLF/LF line endings, a trailing newline, and skips
 * fully-empty lines. Never throws on malformed input — it returns whatever it can
 * parse so the intake engine can report field-level errors instead of failing hard.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][]; // data rows (header excluded), each a list of cell strings
}

/** Tokenise CSV text into rows of cells, honouring RFC-4180-style quoting. */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellStarted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      cellStarted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      cellStarted = true;
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      cellStarted = false;
      continue;
    }
    cell += ch;
    cellStarted = true;
  }
  // Flush the final cell/row if the text did not end with a newline.
  if (cellStarted || cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A row is empty when every cell is blank after trimming. */
function isEmptyRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/**
 * Parse CSV text into headers + data rows. The first non-empty line is the header.
 * Cells are trimmed. Empty lines are skipped. Returns empty headers/rows for blank
 * input (the caller reports that as an error, never inventing data).
 */
export function parseCsv(text: string): ParsedCsv {
  if (typeof text !== "string" || text.trim() === "") return { headers: [], rows: [] };

  const all = tokenize(text).filter((cells) => !isEmptyRow(cells));
  if (all.length === 0) return { headers: [], rows: [] };

  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1).map((cells) => cells.map((c) => c.trim()));
  return { headers, rows };
}
