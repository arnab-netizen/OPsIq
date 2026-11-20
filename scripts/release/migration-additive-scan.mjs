#!/usr/bin/env node
/**
 * Static additive-only scan for production batch migrations (MAIN_BATCH mode of
 * .github/workflows/migrate-production.yml).
 *
 * A migration may be applied by the batch path ONLY if every statement in its migration.sql is an
 * allow-listed ADDITIVE statement:
 *   - CREATE TABLE [IF NOT EXISTS] t ( ... )
 *   - CREATE [UNIQUE] INDEX [IF NOT EXISTS] i ON t [USING m] ( ... ) [INCLUDE ( ... )] [WHERE <no function call>]   (never CONCURRENTLY)
 *   - CREATE TYPE t AS ENUM ( 'a', ... )
 *   - ALTER TABLE t ADD COLUMN c <type> [NOT NULL | NULL | DEFAULT <literal>]...   (a NOT NULL column needs a DEFAULT; no inline
 *     REFERENCES / CHECK / UNIQUE / PRIMARY KEY / GENERATED)
 *   - ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY ... | CHECK (...)   -- NOT VALID is required unless t was created earlier in the same file;
 *     UNIQUE / PRIMARY KEY / EXCLUDE constraints are refused (use CREATE UNIQUE INDEX)
 *   - comments (stripped before analysis)
 * A DEFAULT must be a literal (number, quoted string optionally cast, TRUE/FALSE/NULL, CURRENT_TIMESTAMP/CURRENT_DATE). No function call is
 * allowed in a DEFAULT, a CHECK or an index WHERE. Everything else (DROP, TRUNCATE, DELETE, UPDATE, INSERT, RENAME, ALTER COLUMN,
 * GRANT/REVOKE, DO blocks, functions, triggers, views, COPY, GENERATED, ...) is rejected.
 *
 * The scan FAILS CLOSED, and its lexer is deliberately STRICTER than PostgreSQL's so the two can never disagree about where a comment, string or
 * statement ends: control characters, a bare carriage return (PostgreSQL ends a `--` comment at CR as well as LF), NUL, any `$` that is not a plain
 * positional parameter (no dollar-quote form of any length or alphabet), any backslash outside a comment, escape/unicode-escape strings, any
 * non-ASCII character outside a comment, string literal or quoted identifier, an unterminated comment/string/identifier, a statement matching no
 * allow-list pattern, and a file with no statement at all are rejections, never passes. Differentially tested against real PostgreSQL
 * (migration-additive-scan.db.test.ts): for every accepted input no statement outside the allow-list executes.
 *
 * The scan also derives the objects each migration creates (tables, columns, indexes, types, constraints) so the reviewed batch manifest's
 * "creates" lists can be proven equal to what the SQL really does, and so the post-migration verification checks exactly those objects.
 *
 * Pure, side-effect-free, no database access.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class AdditiveScanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const IDENT_CHARS = /[A-Za-z0-9_$]/;

/**
 * Strip comments, replace string literals with ? and keep quoted identifiers verbatim.
 * Returns the sanitized text. Throws AdditiveScanError on anything it cannot classify with certainty.
 */
export function sanitizeSql(sql) {
  if (typeof sql !== "string") throw new AdditiveScanError("NOT_TEXT", "migration SQL must be text");
  if (sql.includes("\u0000")) throw new AdditiveScanError("NUL_BYTE", "migration SQL contains a NUL byte");
  // Rule CONTROL_CHAR: only TAB, LF and CR (as part of CRLF) may appear anywhere, comments and strings included.
  if (/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(sql)) {
    throw new AdditiveScanError("CONTROL_CHAR", "control character (other than tab / newline) is not allowed");
  }
  // Rule BARE_CR: PostgreSQL ends a line comment at a bare CR; a scanner that only looks for LF would disagree about what is commented out.
  if (/\r(?!\n)/.test(sql)) {
    throw new AdditiveScanError("BARE_CR", "a carriage return not followed by a line feed is not allowed");
  }
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      // Rule LINE_COMMENT_EOL: a `--` comment ends at LF or CR (belt and braces with BARE_CR).
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      out += " ";
      continue;
    }
    if (c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth > 0) throw new AdditiveScanError("UNTERMINATED_COMMENT", "unterminated block comment");
      out += " ";
      continue;
    }
    if (c === "'") {
      const prev = out.length ? out[out.length - 1] : "";
      if ((prev === "E" || prev === "e") && !IDENT_CHARS.test(out[out.length - 2] ?? " ")) {
        throw new AdditiveScanError("ESCAPE_STRING", "escape-string literal (E'...') is not allowed");
      }
      if (prev === "&" && /u/i.test(out[out.length - 2] ?? "")) {
        throw new AdditiveScanError("ESCAPE_STRING", "unicode-escape string literal (U&'...') is not allowed");
      }
      i++;
      let closed = false;
      while (i < n) {
        // Rule BACKSLASH_IN_STRING: with standard_conforming_strings off a backslash would escape the quote; refuse rather than depend on a server setting.
        if (sql[i] === "\\") throw new AdditiveScanError("BACKSLASH", "backslash inside a string literal is not allowed");
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) throw new AdditiveScanError("UNTERMINATED_STRING", "unterminated string literal");
      out += "?";
      continue;
    }
    if (c === '"') {
      const prev = out.length ? out[out.length - 1] : "";
      if (prev === "&" && /u/i.test(out[out.length - 2] ?? "")) {
        throw new AdditiveScanError("ESCAPE_STRING", "unicode-escape identifier (U&\"...\") is not allowed");
      }
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === "\\") throw new AdditiveScanError("BACKSLASH", "backslash inside a quoted identifier is not allowed");
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) throw new AdditiveScanError("UNTERMINATED_IDENTIFIER", "unterminated quoted identifier");
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      // Rule DOLLAR: any `$` that is not a plain positional parameter ($ + digits, not inside a longer identifier) is refused. No tag
      // length cap and no alphabet restriction (PostgreSQL accepts non-ASCII tags), so no dollar-quote form can reach the lexer unseen.
      const prevCh = out.length ? out[out.length - 1] : "";
      const positional = /^\$[0-9]+(?![A-Za-z0-9_$\u0080-￿])/.test(sql.slice(i)) && !IDENT_CHARS.test(prevCh);
      if (!positional) throw new AdditiveScanError("DOLLAR_QUOTE", "`$` is only allowed as a plain positional parameter; dollar quoting and `$` inside identifiers are not allowed");
    }
    if (c === "\\") throw new AdditiveScanError("BACKSLASH", "backslash outside a string literal is not allowed");
    // Rule NON_ASCII: outside comments, strings and quoted identifiers every character must be ASCII (no unicode whitespace, no unicode identifiers).
    if (c.charCodeAt(0) > 127) throw new AdditiveScanError("NON_ASCII", "non-ASCII character outside a comment, string or quoted identifier");
    out += c;
    i++;
  }
  return out;
}

/** Split sanitized SQL into statements on top-level semicolons (quoted identifiers are skipped). */
export function splitStatements(clean) {
  const statements = [];
  let cur = "";
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (c === '"') {
      let j = i + 1;
      while (j < clean.length) {
        if (clean[j] === '"') {
          if (clean[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += clean.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      statements.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  statements.push(cur);
  return statements.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0);
}

const IDENT = `(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = `(?:"public"\\.|public\\.)?(${IDENT})`;

/** Strip quoting from an identifier: "Name" -> Name, bare names fold to lower case (PostgreSQL rule). */
export function unquoteIdent(raw) {
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/""/g, '"');
  return raw.toLowerCase();
}

/** Replace quoted identifiers by the token ID so keyword scanning never trips on a table or column named like a keyword. */
function withoutQuotedIdents(s) {
  return s.replace(/"(?:[^"]|"")+"/g, "ID");
}

const REFERENTIAL_ACTION = /\bON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)\b/gi;

const FORBIDDEN_KEYWORD =
  /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|RENAME|GRANT|REVOKE|SELECT|COPY|EXECUTE|CALL|DO|VACUUM|REINDEX|CLUSTER|COMMENT|OWNER|DISABLE|ENABLE|CONCURRENTLY|FUNCTION|TRIGGER|VIEW|EXTENSION|SCHEMA|ROLE|POLICY|RULE|BEGIN|COMMIT|ROLLBACK|LOCK|GENERATED|SET\s+DATA|ALTER\s+COLUMN|ALTER\s+TYPE)\b/i;

function splitTopLevelCommas(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '"' && s[j + 1] !== '"')) j += s[j] === '"' ? 2 : 1;
      cur += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
    i++;
  }
  parts.push(cur.trim());
  return parts;
}

function balanced(s) {
  let depth = 0;
  const t = withoutQuotedIdents(s);
  for (const c of t) {
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function rejected(statement, reason) {
  return { ok: false, statement: statement.slice(0, 160), reason };
}

// ─── literal-only defaults, call-free CHECK / WHERE ──────────────────────────

// A DEFAULT may only be: a number, a quoted string (masked to ?) optionally cast to a type, TRUE/FALSE/NULL, CURRENT_TIMESTAMP, CURRENT_DATE.
const LITERAL_DEFAULT = /^(?:-?\d+(?:\.\d+)?|\?(?:::(?:ID|[A-Za-z_][A-Za-z0-9_]*)(?:\[\])?)?|TRUE|FALSE|NULL|CURRENT_TIMESTAMP|CURRENT_DATE)$/i;
const DEFAULT_BOUNDARY = /^\s+(?:NOT\s+NULL|NULL|CONSTRAINT|CHECK|REFERENCES|PRIMARY|UNIQUE|GENERATED|COLLATE|DEFAULT)\b/i;

/** Read one DEFAULT expression from the text right after the DEFAULT keyword. Returns { expr, rest }. */
function takeDefaultExpr(after) {
  let depth = 0;
  let i = 0;
  while (i < after.length) {
    const c = after[i];
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) break;
    else if (depth === 0 && /\s/.test(c) && DEFAULT_BOUNDARY.test(after.slice(i))) break;
    i++;
  }
  return { expr: after.slice(0, i).trim(), rest: after.slice(i) };
}

/** Violations of the literal-only DEFAULT rule in a statement view (quoted identifiers already replaced by ID). */
function defaultViolations(view) {
  const bad = [];
  for (const m of view.matchAll(/\bDEFAULT\b/gi)) {
    const { expr } = takeDefaultExpr(view.slice(m.index + m[0].length).trimStart());
    if (!LITERAL_DEFAULT.test(expr)) bad.push(`DEFAULT '${expr.slice(0, 40)}' is not a literal`);
  }
  return bad;
}

const CALL_EXEMPT = new Set(["IN", "AND", "OR", "NOT", "WHERE", "CHECK", "ANY", "ALL", "SOME", "BETWEEN", "IS", "LIKE", "ILIKE", "NULL", "ON", "AS"]);

/** True when `expr` contains a function call (an identifier or quoted identifier directly followed by an opening parenthesis). */
function hasFunctionCall(expr) {
  for (const m of expr.matchAll(/([A-Za-z_][A-Za-z0-9_$]*|ID)\s*\(/g)) {
    if (!CALL_EXEMPT.has(m[1].toUpperCase())) return true;
  }
  return false;
}

/** Contents of every CHECK ( ... ) in the view. */
function checkBodies(view) {
  const bodies = [];
  for (const m of view.matchAll(/\bCHECK\s*\(/gi)) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    while (j < view.length && depth > 0) {
      if (view[j] === "(") depth++;
      else if (view[j] === ")") depth--;
      j++;
    }
    bodies.push(view.slice(start, j - 1));
  }
  return bodies;
}

// ─── ADD COLUMN definition ───────────────────────────────────────────────────

// R2: a column type must be on this allow-list (case-insensitive, optional [] array suffix). A bare identifier that is not listed is refused:
// the serial family creates a sequence plus a volatile default and rewrites the table, and the sequence is invisible to the manifest "creates".
const BUILTIN_TYPE = new RegExp(
  "^(?:text" +
    "|(?:varchar|character\\s+varying|char|character|bpchar)(?:\\(\\s*\\d+\\s*\\))?" +
    "|integer|int|int4|bigint|int8|smallint|int2|boolean|bool|uuid" +
    "|timestamptz(?:\\(\\s*\\d\\s*\\))?" +
    "|timestamp(?:\\(\\s*\\d\\s*\\))?(?:\\s+with(?:out)?\\s+time\\s+zone)?" +
    "|date|timetz" +
    "|time(?:\\(\\s*\\d\\s*\\))?(?:\\s+with(?:out)?\\s+time\\s+zone)?" +
    "|jsonb|json" +
    "|(?:numeric|decimal)(?:\\(\\s*\\d+\\s*(?:,\\s*\\d+\\s*)?\\))?" +
    "|double\\s+precision|real|float4|float8|bytea)" +
    "(?:\\s*\\[\\s*\\d*\\s*\\])*$",
  "i"
);
// A user enum type exactly as Prisma writes it: "Name" or "public"."Name", optional array suffix. A quoted type name is accepted only if it can
// never collide with a built-in or pseudo type (serial, bigserial, ... are resolved from a quoted lowercase name too): it must contain at least one
// ASCII uppercase letter (every built-in type name is lowercase; Prisma enum names are PascalCase), and be unqualified or qualified with "public" only.
const QUOTED_TYPE_SHAPE = /^(?:"public"\.)?"((?:[^"]|"")+)"((?:\s*\[\s*\d*\s*\])*)$/;
const SERIAL_TYPE = /^(?:small|big)?serial(?:2|4|8)?$/i;

/** Returns null when the type text is allowed, else the reason. */
function typeViolation(typeText) {
  const t = typeText.trim().replace(/\s+/g, " ");
  const q = t.match(QUOTED_TYPE_SHAPE);
  if (q) {
    const name = q[1].replace(/""/g, '"');
    const folded = name.toLowerCase();
    if (SERIAL_TYPE.test(folded)) return `column type '${t.slice(0, 40)}' is a serial-family type (creates a sequence and a volatile default and rewrites the table): not a plain type on the allow-list`;
    if (!/[A-Z]/.test(name)) return `quoted column type '${t.slice(0, 40)}' has no uppercase letter, so it could name a built-in or pseudo type: not a plain type on the allow-list`;
    if (BUILTIN_TYPE.test(folded)) return `quoted column type '${t.slice(0, 40)}' folds to a built-in type name: not a plain type on the allow-list`;
    return null;
  }
  if (/^"[^"]+"\./.test(t) || /^[A-Za-z_][A-Za-z0-9_]*\./.test(t)) return `schema-qualified column type '${t.slice(0, 40)}' is not a plain type on the allow-list (only "public"."Name" with an uppercase letter is allowed)`;
  if (SERIAL_TYPE.test(t.replace(/\s*\[.*$/, ""))) return `column type '${t.slice(0, 40)}' is a serial-family type (creates a sequence and a volatile default and rewrites the table): not a plain type on the allow-list`;
  if (BUILTIN_TYPE.test(t)) return null;
  return `column type '${t.slice(0, 50)}' is not a plain type on the allow-list`;
}

/** Same length as the input, with the inside of every quoted identifier blanked, so keyword searches can use the original offsets. */
function maskQuoted(s) {
  return s.replace(/"(?:[^"]|"")+"/g, (q) => `"${"_".repeat(q.length - 2)}"`);
}

/** Parse an ADD COLUMN / CREATE TABLE column definition (after the column name): <type> then only NOT NULL / NULL / DEFAULT <literal>. */
function parseColumnDefinition(def) {
  const masked = maskQuoted(def);
  const split = masked.search(/\b(?:NOT\s+NULL|NULL|DEFAULT)\b/i);
  const typePart = (split < 0 ? def : def.slice(0, split)).trim();
  const bad = typeViolation(typePart);
  if (bad) return { ok: false, reason: bad };
  const view = withoutQuotedIdents(def);
  let rest = split < 0 ? "" : view.slice(view.search(/\b(?:NOT\s+NULL|NULL|DEFAULT)\b/i));
  let notNull = false;
  let hasDefault = false;
  while (rest.trim().length > 0) {
    rest = rest.trimStart();
    let m = rest.match(/^NOT\s+NULL\b/i);
    if (m) {
      notNull = true;
      rest = rest.slice(m[0].length);
      continue;
    }
    m = rest.match(/^NULL\b/i);
    if (m) {
      rest = rest.slice(m[0].length);
      continue;
    }
    m = rest.match(/^DEFAULT\b/i);
    if (m) {
      const { expr, rest: after } = takeDefaultExpr(rest.slice(m[0].length).trimStart());
      if (!LITERAL_DEFAULT.test(expr)) return { ok: false, reason: `DEFAULT '${expr.slice(0, 40)}' is not a literal` };
      hasDefault = true;
      rest = after;
      continue;
    }
    return { ok: false, reason: `unsupported column modifier '${rest.slice(0, 30)}' (only NOT NULL, NULL, DEFAULT <literal> are allowed)` };
  }
  return { ok: true, notNull, hasDefault };
}


// ─── CREATE TABLE, strictly structural (R1) ──────────────────────────────────

/** Index of the parenthesis closing the one at `open` (quoted identifiers skipped), or -1. */
function matchingClose(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && !(text[j] === '"' && text[j + 1] !== '"')) j += text[j] === '"' ? 2 : 1;
      i = j;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const COLS = "\\(\\s*(?:ID|[A-Za-z_][A-Za-z0-9_]*)(?:\\s*,\\s*(?:ID|[A-Za-z_][A-Za-z0-9_]*))*\\s*\\)";
const IDN = "(?:ID|[A-Za-z_][A-Za-z0-9_]*)";

/**
 * CREATE TABLE <name> ( <column definitions and table constraints> ) and NOTHING after the closing parenthesis.
 * Refused by construction: IF NOT EXISTS, AS / VALUES / SELECT, PARTITION BY, INHERITS, LIKE, WITH, TABLESPACE, USING, ON COMMIT, UNLOGGED/TEMP,
 * inline column constraints, EXCLUDE, DEFERRABLE, MATCH ... Every element is either a column "<name> <allow-listed type> [NOT NULL|NULL|DEFAULT literal]..."
 * or a table constraint (PRIMARY KEY / UNIQUE column list, FOREIGN KEY ... REFERENCES t(cols) [ON DELETE|UPDATE action], CHECK (call-free)).
 */
function parseCreateTable(stmt) {
  const head = stmt.match(new RegExp(`^CREATE\\s+TABLE\\s+${QNAME}\\s*\\(`, "i"));
  if (!head) return { ok: false, reason: "CREATE TABLE must be exactly `CREATE TABLE <name> ( ... )` (no IF NOT EXISTS, TEMP/UNLOGGED, AS, PARTITION, INHERITS, LIKE, WITH, TABLESPACE, USING, ON COMMIT)" };
  const open = head[0].length - 1;
  const close = matchingClose(stmt, open);
  if (close < 0 || close !== stmt.length - 1) return { ok: false, reason: "CREATE TABLE: the parenthesis opened after the table name must close at the very end of the statement (nothing may follow it)" };
  const body = stmt.slice(open + 1, close);
  const elements = splitTopLevelCommas(body);
  let columns = 0;
  for (const el of elements) {
    if (el.length === 0) return { ok: false, reason: "CREATE TABLE: empty element in the column list" };
    const view = withoutQuotedIdents(el).replace(REFERENTIAL_ACTION, " REFACTION ").replace(/\s+/g, " ").trim();
    const named = view.match(new RegExp(`^CONSTRAINT\\s+${IDN}\\s+(.*)$`, "i"));
    const cons = named ? named[1] : view;
    if (/^(?:PRIMARY\s+KEY|UNIQUE)\s*/i.test(cons) || /^(?:FOREIGN\s+KEY|CHECK)\b/i.test(cons) || named) {
      if (new RegExp(`^(?:PRIMARY\\s+KEY|UNIQUE)\\s*${COLS}$`, "i").test(cons)) continue;
      if (new RegExp(`^FOREIGN\\s+KEY\\s*${COLS}\\s+REFERENCES\\s+(?:ID\\.)?${IDN}\\s*${COLS}(?:\\s+REFACTION)*$`, "i").test(cons)) continue;
      const ck = cons.match(/^CHECK\s*\(/i);
      if (ck) {
        const o = cons.indexOf("(");
        if (matchingClose(cons, o) === cons.length - 1) continue; // call-free CHECK is enforced for the whole statement above
      }
      return { ok: false, reason: `CREATE TABLE: table constraint '${el.slice(0, 60)}' is not a plain PRIMARY KEY / UNIQUE column list, FOREIGN KEY ... REFERENCES t(cols), or CHECK` };
    }
    const col = el.match(new RegExp(`^(${IDENT})\\s+(.+)$`, "i"));
    if (!col) return { ok: false, reason: `CREATE TABLE: element '${el.slice(0, 60)}' is not a column definition` };
    const parsed = parseColumnDefinition(col[2]);
    if (!parsed.ok) return { ok: false, reason: `CREATE TABLE column ${col[1]}: ${parsed.reason}` };
    columns++;
  }
  if (columns === 0) return { ok: false, reason: "CREATE TABLE: no column definition" };
  return { ok: true, table: unquoteIdent(head[1]) };
}

/**
 * Classify one sanitized statement. Returns { ok:true, creates:{...} } or { ok:false, reason, statement }.
 * ctx.createdTables: tables created earlier in the same file (their constraints need no NOT VALID).
 */
export function classifyStatement(stmt, ctx = { createdTables: new Set() }) {
  if (!balanced(stmt)) return rejected(stmt, "unbalanced parentheses");
  const keywordView = withoutQuotedIdents(stmt).replace(REFERENTIAL_ACTION, " REFACTION ");
  const forbidden = keywordView.match(FORBIDDEN_KEYWORD);
  if (forbidden) return rejected(stmt, `forbidden keyword '${forbidden[0].toUpperCase()}'`);
  const defaults = defaultViolations(keywordView);
  if (defaults.length) return rejected(stmt, defaults[0]);
  for (const body of checkBodies(keywordView)) {
    if (hasFunctionCall(body)) return rejected(stmt, "function call inside a CHECK constraint");
  }

  let m;
  if (/^CREATE\s+TABLE\b/i.test(stmt)) {
    const ct = parseCreateTable(stmt);
    if (!ct.ok) return rejected(stmt, ct.reason);
    ctx.createdTables.add(ct.table);
    return { ok: true, creates: { tables: [ct.table] } };
  }

  m = stmt.match(
    new RegExp(
      `^CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QNAME}\\s+ON\\s+(?:ONLY\\s+)?${QNAME}\\s*(?:USING\\s+[A-Za-z]+\\s*)?\\(.*\\)(?:\\s+INCLUDE\\s*\\(.*\\))?(?:\\s+WHERE\\s+(.+))?$`,
      "i"
    )
  );
  if (m) {
    // The column list's greedy match can swallow the WHERE clause, so the predicate is taken from the keyword view instead of a capture group.
    const where = keywordView.match(/\bWHERE\b(.*)$/i);
    if (where && hasFunctionCall(where[1])) return rejected(stmt, "function call inside an index WHERE predicate");
    return {
      ok: true,
      creates: { indexes: [{ table: unquoteIdent(m[3]), name: unquoteIdent(m[2]), unique: Boolean(m[1]) }] },
    };
  }

  m = stmt.match(new RegExp(`^CREATE\\s+TYPE\\s+${QNAME}\\s+AS\\s+ENUM\\s*\\(\\s*\\?(?:\\s*,\\s*\\?)*\\s*\\)$`, "i"));
  if (m) return { ok: true, creates: { types: [unquoteIdent(m[1])] } };

  m = stmt.match(new RegExp(`^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${QNAME}\\s+(.+)$`, "i"));
  if (m) {
    const table = unquoteIdent(m[1]);
    const creates = { columns: [], constraints: [] };
    for (const action of splitTopLevelCommas(m[2])) {
      const col = action.match(new RegExp(`^ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+(.+)$`, "i"));
      if (col) {
        const parsed = parseColumnDefinition(col[2]);
        if (!parsed.ok) return rejected(stmt, `ADD COLUMN ${col[1]}: ${parsed.reason}`);
        if (parsed.notNull && !parsed.hasDefault) {
          return rejected(stmt, `ADD COLUMN ${col[1]} is NOT NULL without a DEFAULT (would fail or rewrite existing rows)`);
        }
        creates.columns.push({ table, column: unquoteIdent(col[1]), nullable: !parsed.notNull });
        continue;
      }
      const con = action.match(new RegExp(`^ADD\\s+CONSTRAINT\\s+(${IDENT})\\s+(FOREIGN\\s+KEY|CHECK)\\b(.*)$`, "i"));
      if (con) {
        const needsNotValid = !ctx.createdTables.has(table);
        if (needsNotValid && !/\bNOT\s+VALID\s*$/i.test(con[3])) {
          return rejected(stmt, `ADD CONSTRAINT ${con[1]} on existing table '${table}' must be NOT VALID (no validation scan under lock)`);
        }
        creates.constraints.push({ table, name: unquoteIdent(con[1]) });
        continue;
      }
      if (/^ADD\s+CONSTRAINT\b/i.test(action)) {
        return rejected(stmt, "ADD CONSTRAINT UNIQUE / PRIMARY KEY / EXCLUDE is not allowed (use CREATE UNIQUE INDEX)");
      }
      return rejected(stmt, `ALTER TABLE action is not ADD COLUMN / ADD CONSTRAINT: '${action.slice(0, 60)}'`);
    }
    return { ok: true, creates };
  }

  return rejected(stmt, "statement matches no additive allow-list pattern");
}

const EMPTY = () => ({ tables: [], columns: [], indexes: [], types: [], constraints: [] });

/**
 * Scan one migration.sql. Returns { ok, statements, violations, creates } and never throws: an unparseable
 * input is reported as ok:false with a SCAN_ERROR violation.
 */
export function scanAdditiveOnly(sql) {
  let clean;
  try {
    clean = sanitizeSql(sql);
  } catch (e) {
    if (e instanceof AdditiveScanError) {
      return { ok: false, statements: 0, violations: [{ statement: "", reason: `${e.code}: ${e.message}` }], creates: EMPTY() };
    }
    throw e;
  }
  const statements = splitStatements(clean);
  if (statements.length === 0) {
    return {
      ok: false,
      statements: 0,
      violations: [{ statement: "", reason: "NO_STATEMENTS: the migration contains no executable statement" }],
      creates: EMPTY(),
    };
  }
  const violations = [];
  const creates = EMPTY();
  const ctx = { createdTables: new Set() };
  for (const s of statements) {
    const r = classifyStatement(s, ctx);
    if (!r.ok) {
      violations.push({ statement: r.statement, reason: r.reason });
      continue;
    }
    for (const key of Object.keys(creates)) creates[key].push(...(r.creates[key] ?? []));
  }
  return { ok: violations.length === 0, statements: statements.length, violations, creates };
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("::error::usage: node scripts/release/migration-additive-scan.mjs <migration.sql>...");
    process.exit(2);
  }
  let failed = false;
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch {
      console.error(`::error::cannot read ${f}`);
      failed = true;
      continue;
    }
    const r = scanAdditiveOnly(text);
    if (r.ok) console.log(`ADDITIVE_ONLY=PASS ${f} (${r.statements} statements)`);
    else {
      failed = true;
      for (const v of r.violations) console.error(`::error::ADDITIVE_ONLY=FAIL ${f}: ${v.reason} :: ${v.statement}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
