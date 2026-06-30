/**
 * Generate the committed exhaustive-chaos proof ledger JSON from the pure `buildChaosLedger()` source of
 * truth. Run: `npx tsx scripts/gen-chaos-ledger.ts`. The JSON is the authoritative 180-row expectation
 * ledger; layer statuses start at "not_run" and are reported against by the run-result artifacts.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { buildChaosLedger, EXPECTED_LEDGER_COUNT } from "../src/behavioral-validation/chaos-replay/chaos-ledger";

const ledger = buildChaosLedger();
if (ledger.length !== EXPECTED_LEDGER_COUNT) {
  throw new Error(`ledger count ${ledger.length} !== expected ${EXPECTED_LEDGER_COUNT}`);
}
const ids = new Set(ledger.map((e) => e.scenarioId));
if (ids.size !== ledger.length) throw new Error("duplicate scenarioId in ledger");

const payload = {
  schemaVersion: 1,
  generatedBy: "scripts/gen-chaos-ledger.ts",
  expectedCount: EXPECTED_LEDGER_COUNT,
  actualCount: ledger.length,
  note: "Authoritative list of the 180 counted chaos scenarios (165 corpus + 15 independent gold). Layer statuses are 'not_run' until a proof layer records a result.",
  entries: ledger,
};

const out = join(process.cwd(), "OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.json");
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`[gen-chaos-ledger] wrote ${ledger.length} entries to ${out}`);
