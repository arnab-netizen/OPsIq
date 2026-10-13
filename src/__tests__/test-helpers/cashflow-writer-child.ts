/* eslint-disable @typescript-eslint/no-explicit-any -- test helper process */
/**
 * A SECOND SESSION for DB concurrency tests: the app's pool is deliberately max:1 per process, so a genuinely concurrent
 * Cashflow writer has to be its own process (own pool, own connection). Usage (run by the test, never by the app):
 *   tsx cashflow-writer-child.ts '<json>'   json = { op: "amend"|"create", workspaceId, actorId, snapshotId?, businessId?, input, skewMs? }
 * Prints one line `RESULT:{"ok":true}` or `RESULT:{"ok":false,"name":..,"code":..,"message":..}`.
 * `skewMs` makes THIS process's application clock run that many ms behind (to prove ordering uses the database clock).
 */
const spec = JSON.parse(process.argv[2] ?? "{}");
if (spec.skewMs) {
  const RealDate = Date;
  const skew = Number(spec.skewMs);
  class SkewedDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(RealDate.now() - skew);
      else super(...(args as [any]));
    }
    static now() { return RealDate.now() - skew; }
  }
  (globalThis as any).Date = SkewedDate;
}

async function main() {
  const { amendCashflowSnapshot, createCashflowSnapshot } = await import("@/services/owner-cashflow/snapshot.service");
  try {
    if (spec.op === "amend") await amendCashflowSnapshot(spec.snapshotId, spec.input, spec.actorId, spec.workspaceId);
    else await createCashflowSnapshot(spec.businessId, spec.input, spec.actorId, spec.workspaceId);
    console.log("RESULT:" + JSON.stringify({ ok: true }));
  } catch (e: any) {
    console.log("RESULT:" + JSON.stringify({ ok: false, name: e?.constructor?.name, code: e?.body?.code ?? e?.code, message: String(e?.message ?? e) }));
  }
  process.exit(0);
}
void main();
