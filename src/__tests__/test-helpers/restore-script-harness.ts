/**
 * Shared harness for scripts/restore-database.sh portability tests (F-RESTORE-SCRIPT-MACOS-PORTABILITY).
 * Builds tool directories that emulate a stock-macOS PATH (no sha256sum, BSD-style grep that rejects -P) so the
 * real script can be exercised on Linux. This is a SIMULATION; the "native" kind uses the host's real tools and is
 * native proof only when run on the platform in question (e.g. a Mac).
 */
import { chmodSync, existsSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

export function which(bin: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const p = join(dir, bin);
    if (dir && existsSync(p)) return p;
  }
  return null;
}

const BASE_TOOLS = ["bash", "sh", "gzip", "gunzip", "zgrep", "awk", "sed", "tr", "tee", "cat", "head", "tail", "dirname", "basename", "date", "uname", "env", "mktemp", "rm", "cp", "ls", "wc", "cut", "sort", "readlink", "mkdir"];

export type EnvKind = "native" | "no-sha256sum" | "no-sha-tool";
export type PsqlKind = "fake" | "real" | "none";

/** Fake psql: logs the connection URI (first arg), consumes the dump on restore, answers the two verification queries. */
export const FAKE_PSQL = `#!/bin/sh
echo "$1" >> "$PSQL_LOG"
case "$*" in
  *ON_ERROR_STOP*) cat > /dev/null ;;
  *table_count*) printf ' %s\\n' "\${FAKE_TABLES:-7}" ;;
  *TOTAL_ROWS*) printf '%s\\n' "\${FAKE_TOTAL_LINE:-psql:<stdin>:6: NOTICE:  TOTAL_ROWS=42}" >&2 ;;
esac
exit 0
`;

/**
 * A bin directory. "native" = host tools. "no-sha256sum" emulates stock macOS (shasum only, BSD-style grep).
 * "no-sha-tool" has no SHA-256 tool at all. `psql: "real"` links the host's psql (and its libpq environment).
 */
export function toolDir(workDir: string, kind: EnvKind, psql: PsqlKind): string {
  const dir = mkdtempSync(join(workDir, `bin-${kind}-`));
  const link = (name: string, target: string | null) => {
    if (target) symlinkSync(target, join(dir, name));
  };
  link("node", process.execPath);
  for (const t of BASE_TOOLS) link(t, which(t));
  if (kind === "native") {
    link("grep", which("grep"));
    link("sha256sum", which("sha256sum"));
    link("shasum", which("shasum"));
  } else {
    const realGrep = which("grep") ?? "/usr/bin/grep";
    writeFileSync(
      join(dir, "grep"),
      `#!/bin/sh\nfor a in "$@"; do case "$a" in -P|-[a-zA-Z]*P*) echo "grep: invalid option -- P" >&2; exit 2;; esac; done\nexec ${realGrep} "$@"\n`,
    );
    chmodSync(join(dir, "grep"), 0o755);
    if (kind === "no-sha256sum") {
      const real = which("sha256sum");
      if (real) {
        writeFileSync(join(dir, "shasum"), `#!/bin/sh\nif [ "$1" = "-a" ] && [ "$2" = "256" ]; then shift 2; exec ${real} "$@"; fi\necho "shasum: unsupported" >&2; exit 1\n`);
        chmodSync(join(dir, "shasum"), 0o755);
      }
    }
  }
  if (psql === "fake") {
    writeFileSync(join(dir, "psql"), FAKE_PSQL);
    chmodSync(join(dir, "psql"), 0o755);
  } else if (psql === "real") {
    link("psql", which("psql"));
  }
  return dir;
}
