/* eslint-disable @typescript-eslint/no-explicit-any -- test helper process */
/**
 * A SEPARATE PROCESS for Beta Cohort concurrency tests. The app's pool is deliberately max:1 per process, so in-process
 * "concurrent" calls are serialised by the pool and cannot exercise the advisory locks that protect against several
 * serverless instances. Each child has its own pool/connection and waits on a shared start barrier (`startAt`, epoch ms)
 * so the writers genuinely overlap. Usage (run by the test, never by the app):
 *   tsx cohort-writer-child.ts '<json>'   json = { op: "assign"|"evidence", actorId, input, startAt }
 * Prints one line `RESULT:{...}`.
 */
const spec = JSON.parse(process.argv[2] ?? "{}");

async function main() {
  const svc = await import("@/services/beta-cohort/cohort-evidence.service");
  const { assignmentInputSchema, evidenceInputSchema } = await import("@/domain/beta-cohort/evidence");
  const input = spec.op === "assign" ? assignmentInputSchema.parse(spec.input) : evidenceInputSchema.parse(spec.input);
  while (Date.now() < Number(spec.startAt)) { /* barrier */ }
  try {
    const r = spec.op === "assign" ? await svc.assignCohortOwner(input as any, spec.actorId) : await svc.recordCohortEvidence(input as any, spec.actorId);
    console.log("RESULT:" + JSON.stringify({ ok: true, replayed: (r as any).replayed }));
  } catch (e: any) {
    console.log("RESULT:" + JSON.stringify({ ok: false, name: e?.constructor?.name, message: String(e?.message ?? e).slice(0, 200) }));
  }
  process.exit(0);
}
void main();
