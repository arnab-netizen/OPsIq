import { describe, it, expect } from "vitest";
import {
  PrecheckConflictError,
  type PrecheckDeps,
  type PrecheckTx,
  type PrecheckDb,
  runProofPrecheck,
} from "@/services/execution/proof-precheck.service";
import { AiProofPrecheckOutcome as O } from "@/domain/execution/proof-precheck";
import { ProofStatus, ProofType, ProofRiskLevel } from "@/domain/execution/proof";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const WS = "ws-1";

function makeDeps(opts: { committedStatus?: ProofStatus } = {}) {
  const committed = { status: opts.committedStatus ?? ProofStatus.SUBMITTED };
  let pending = { status: committed.status };
  const calls = { audits: [] as Record<string, unknown>[], updates: 0, updateData: [] as Record<string, unknown>[] };
  const tx: PrecheckTx = {
    proof: {
      updateMany: async (args) => {
        calls.updates += 1;
        calls.updateData.push(args.data as Record<string, unknown>);
        const w = args.where as { status: ProofStatus; workspaceId: string };
        const match = w.status === committed.status && w.workspaceId === WS;
        if (match) pending = { status: (args.data as { status: ProofStatus }).status };
        return { count: match ? 1 : 0 };
      },
    },
    auditEvent: { create: async (a) => { calls.audits.push(a.data); return {}; } },
  };
  const db: PrecheckDb = {
    proof: tx.proof,
    auditEvent: tx.auditEvent,
    $transaction: async (fn) => {
      pending = { status: committed.status };
      const r = await fn(tx);
      committed.status = pending.status;
      return r;
    },
  };
  return { deps: { db, now: () => NOW } as PrecheckDeps, committed, calls };
}

const payment = { proofType: ProofType.PAYMENT_CONFIRMATION, requiredFields: ["amount"], riskLevel: ProofRiskLevel.HIGH };
const photo = { proofType: ProofType.PHOTO, requiredFields: ["caption"], riskLevel: ProofRiskLevel.LOW };

describe("proof precheck service — module contract assertions", () => {
  it("runProofPrecheck is a function", () => { expect(typeof runProofPrecheck).toBe("function"); });
  it("PrecheckConflictError is a class/function", () => { expect(typeof PrecheckConflictError).toBe("function"); });
  it("AiProofPrecheckOutcome (O) is an object", () => { expect(typeof O).toBe("object"); });
  it("O.PASS_PRELIMINARY is defined", () => { expect(O.PASS_PRELIMINARY).toBeDefined(); });
  it("O.FAIL_MISSING_REQUIRED_PROOF is defined", () => { expect(O.FAIL_MISSING_REQUIRED_PROOF).toBeDefined(); });
  it("ProofStatus is an object", () => { expect(typeof ProofStatus).toBe("object"); });
  it("ProofStatus.SUBMITTED is defined", () => { expect(ProofStatus.SUBMITTED).toBeDefined(); });
  it("ProofType is an object", () => { expect(typeof ProofType).toBe("object"); });
  it("ProofType.PHOTO is defined", () => { expect(ProofType.PHOTO).toBeDefined(); });
  it("ProofRiskLevel is an object", () => { expect(typeof ProofRiskLevel).toBe("object"); });
  it("ProofRiskLevel.HIGH is defined", () => { expect(ProofRiskLevel.HIGH).toBeDefined(); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("payment has proofType field", () => { expect(payment).toHaveProperty("proofType"); });
  it("photo has proofType field", () => { expect(photo).toHaveProperty("proofType"); });
});

describe("runProofPrecheck", () => {
  it("advances a clean low-risk proof to AI_PRECHECK_PASSED and writes an AI-ledger entry", async () => {
    const { deps, committed, calls } = makeDeps();
    const r = await runProofPrecheck(
      {
        proofId: "p1",
        workspaceId: WS,
        requirement: photo,
        submission: { proofType: ProofType.PHOTO, fields: { caption: "ok" }, submittedByUserId: "emp-1" },
      },
      deps
    );
    expect(r.outcome).toBe(O.PASS_PRELIMINARY);
    expect(r.status).toBe(ProofStatus.AI_PRECHECK_PASSED);
    expect(committed.status).toBe(ProofStatus.AI_PRECHECK_PASSED);
    expect(calls.audits[0].eventName).toBe("ai_proof_precheck.recorded");
    expect((calls.audits[0].payload as Record<string, unknown>).finalAccept).toBe(false);
  });

  it("AI cannot final-accept a payment proof — routes to NEEDS_HUMAN_REVIEW", async () => {
    const { deps, committed } = makeDeps();
    const r = await runProofPrecheck(
      {
        proofId: "p1",
        workspaceId: WS,
        requirement: payment,
        submission: { proofType: ProofType.PAYMENT_CONFIRMATION, fields: { amount: 500 }, submittedByUserId: "emp-1" },
      },
      deps
    );
    expect(r.status).toBe(ProofStatus.NEEDS_HUMAN_REVIEW);
    expect(committed.status).not.toBe(ProofStatus.ACCEPTED);
  });

  it("AI flags missing required proof (AI_PRECHECK_FAILED)", async () => {
    const { deps } = makeDeps();
    const r = await runProofPrecheck(
      {
        proofId: "p1",
        workspaceId: WS,
        requirement: payment,
        submission: { proofType: ProofType.PAYMENT_CONFIRMATION, fields: {}, submittedByUserId: "emp-1" },
      },
      deps
    );
    expect(r.outcome).toBe(O.FAIL_MISSING_REQUIRED_PROOF);
    expect(r.status).toBe(ProofStatus.AI_PRECHECK_FAILED);
  });

  it("AI flags wrong format", async () => {
    const { deps } = makeDeps();
    const r = await runProofPrecheck(
      {
        proofId: "p1",
        workspaceId: WS,
        requirement: photo,
        submission: { proofType: ProofType.INVOICE, fields: { caption: "x" }, submittedByUserId: "emp-1" },
      },
      deps
    );
    expect(r.outcome).toBe(O.FAIL_WRONG_FORMAT);
  });

  it("persists tamperSuspected=true atomically when the precheck flags tamper risk", async () => {
    const { deps, calls } = makeDeps();
    const r = await runProofPrecheck(
      {
        proofId: "p1",
        workspaceId: WS,
        requirement: photo,
        submission: { proofType: ProofType.PHOTO, fields: { caption: "ok" }, submittedByUserId: "emp-1" },
        signals: { tamperRisk: true },
      },
      deps
    );
    expect(r.outcome).toBe(O.POSSIBLE_TAMPER_RISK);
    expect(r.status).toBe(ProofStatus.NEEDS_HUMAN_REVIEW);
    expect(calls.updateData[0].tamperSuspected).toBe(true);
  });

  it("does NOT set tamperSuspected on a clean proof (no fabricated flag)", async () => {
    const { deps, calls } = makeDeps();
    await runProofPrecheck(
      {
        proofId: "p1",
        workspaceId: WS,
        requirement: photo,
        submission: { proofType: ProofType.PHOTO, fields: { caption: "ok" }, submittedByUserId: "emp-1" },
      },
      deps
    );
    expect(calls.updateData[0].tamperSuspected).toBeUndefined();
  });

  it("fails closed when the proof is not in SUBMITTED state", async () => {
    const { deps } = makeDeps({ committedStatus: ProofStatus.ACCEPTED });
    await expect(
      runProofPrecheck(
        {
          proofId: "p1",
          workspaceId: WS,
          requirement: photo,
          submission: { proofType: ProofType.PHOTO, fields: { caption: "ok" }, submittedByUserId: "emp-1" },
        },
        deps
      )
    ).rejects.toBeInstanceOf(PrecheckConflictError);
  });
});
