import { createHash } from "crypto";
import { logger } from "@/infra/logger";

export interface AuditOutput {
  decision_id: string; // Idempotent hash of inputs
  engagement_id: string;
  workspace_id: string;
  inputs_snapshot: {
    paths_count: number;
    diagnostic_confidence: number; // 0-1
    constraints_count: number;
  };
  inputs_snapshot_hash: string; // SHA256 of inputs
  engine_version: string; // "7.2.0"
  metrics: {
    priority_score: number;
    expected_value: number;
    downside_exposure: number;
    payback_days: number;
    dimensions_won: number; // 2-4
  };
  gates_passed: string[];
  gates_failed: string[];
  constraints_enforced: {
    capacity: boolean;
    cash_runway: boolean;
    compliance: boolean;
    archetype: boolean;
    maturity: boolean;
  };
  assumptions: string[];
  decision_made_at: string; // ISO timestamp
}

export class AuditOutputGenerator {
  /**
   * Generate complete audit output for decision
   */
  generateAuditOutput(
    engagementId: string,
    workspaceId: string,
    pathsCount: number,
    diagnosticConfidence: number,
    constraintsCount: number,
    priorityScore: number,
    expectedValue: number,
    downsideExposure: number,
    paybackDays: number,
    dimensionsWon: number,
    gatesPassed: string[],
    gatesFailed: string[],
    inputsSnapshot: Record<string, unknown>
  ): AuditOutput {
    const inputsSnapshotHash = this.hashInputs(inputsSnapshot);
    const decisionId = this.generateDecisionId(
      engagementId,
      workspaceId,
      inputsSnapshotHash
    );

    const auditOutput: AuditOutput = {
      decision_id: decisionId,
      engagement_id: engagementId,
      workspace_id: workspaceId,
      inputs_snapshot: {
        paths_count: pathsCount,
        diagnostic_confidence: diagnosticConfidence,
        constraints_count: constraintsCount,
      },
      inputs_snapshot_hash: inputsSnapshotHash,
      engine_version: "7.2.0",
      metrics: {
        priority_score: priorityScore,
        expected_value: expectedValue,
        downside_exposure: downsideExposure,
        payback_days: paybackDays,
        dimensions_won: dimensionsWon,
      },
      gates_passed: gatesPassed,
      gates_failed: gatesFailed,
      constraints_enforced: {
        capacity: !gatesFailed.includes("capacity_available"),
        cash_runway: !gatesFailed.includes("cash_runway_safe"),
        compliance: !gatesFailed.includes("legal_compliance_ok"),
        archetype: gatesPassed.includes("data_sufficient"), // Archetype in diagnostic data
        maturity: gatesPassed.includes("data_sufficient"), // Maturity in diagnostic data
      },
      assumptions: [
        "Team availability remains stable",
        "Market conditions do not change",
        "External dependencies deliver on time",
        "Diagnostic confidence reflects true uncertainty",
        "Monetization projections are conservative",
        "Risk scores are accurate",
      ],
      decision_made_at: new Date().toISOString(),
    };

    logger.info("Audit output generated", {
      decisionId: auditOutput.decision_id,
      engagementId,
      gatesPassed: gatesPassed.length,
      gatesFailed: gatesFailed.length,
      dimensionsWon,
    });

    return auditOutput;
  }

  /**
   * Generate idempotent decision ID from inputs
   * decision_id = hash(engagement_id + workspace_id + inputs_hash)
   */
  private generateDecisionId(
    engagementId: string,
    workspaceId: string,
    inputsHash: string
  ): string {
    const combined = `${engagementId}:${workspaceId}:${inputsHash}`;
    return createHash("sha256").update(combined).digest("hex").substring(0, 16);
  }

  /**
   * Generate SHA256 hash of inputs snapshot
   */
  private hashInputs(inputs: Record<string, unknown>): string {
    const serialized = JSON.stringify(inputs, Object.keys(inputs).sort());
    return createHash("sha256").update(serialized).digest("hex");
  }

  /**
   * Validate audit output
   */
  validateAuditOutput(audit: AuditOutput): boolean {
    // decision_id must be hex string
    if (!/^[a-f0-9]{16}$/.test(audit.decision_id)) {
      logger.warn("Invalid decision_id format", {
        decisionId: audit.decision_id,
      });
      return false;
    }

    // inputs_snapshot_hash must be hex string (SHA256)
    if (!/^[a-f0-9]{64}$/.test(audit.inputs_snapshot_hash)) {
      logger.warn("Invalid inputs_snapshot_hash format", {
        hash: audit.inputs_snapshot_hash,
      });
      return false;
    }

    // metrics must be finite and reasonable
    if (!Number.isFinite(audit.metrics.priority_score)) {
      logger.warn("Invalid priority_score", {
        priorityScore: audit.metrics.priority_score,
      });
      return false;
    }

    if (!Number.isFinite(audit.metrics.expected_value)) {
      logger.warn("Invalid expected_value", {
        expectedValue: audit.metrics.expected_value,
      });
      return false;
    }

    if (
      audit.metrics.dimensions_won < 0 ||
      audit.metrics.dimensions_won > 4
    ) {
      logger.warn("Invalid dimensions_won", {
        dimensionsWon: audit.metrics.dimensions_won,
      });
      return false;
    }

    // gates_passed + gates_failed should be 5 total (not strict, just guidance)
    const totalGates = audit.gates_passed.length + audit.gates_failed.length;
    if (totalGates === 0) {
      logger.warn("No gates evaluated", {});
      return false;
    }

    // decision_made_at must be valid ISO timestamp
    const timestamp = new Date(audit.decision_made_at);
    if (isNaN(timestamp.getTime())) {
      logger.warn("Invalid decision_made_at timestamp", {
        timestamp: audit.decision_made_at,
      });
      return false;
    }

    return true;
  }
}

export const auditOutputGenerator = new AuditOutputGenerator();
