import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";

interface GuardrailViolation {
  ruleId: string;
  severity: string;
  count: number;
  totalExpectedImpact: number;
}

interface BlockReasonByStage {
  stage: "dependency_validation" | "decision_gate" | "guardrails";
  reasonExamples: string[];
  count: number;
  totalExpectedImpact: number;
  avgConfidence: number;
}

interface BlockedMetrics {
  workspace: {
    workspaceId: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    blockedCount: number;
    rejectedImpact: number;
    avgBlockedConfidence: number;
    lowConfidenceBlockCount: number;
    blocksByStage: Record<
      "dependency_validation" | "decision_gate" | "guardrails",
      {
        count: number;
        rejectedImpact: number;
        avgConfidence: number;
      }
    >;
    topGuardrailViolations: GuardrailViolation[];
    blockReasonsByStage: BlockReasonByStage[];
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Calculate date range: default to last 30 days
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? Math.min(parseInt(daysParam), 90) : 30;

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    // Fetch all blocked decisions
    const blockedDecisions = await db.operatorItem.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        status: "blocked",
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    if (blockedDecisions.length === 0) {
      const emptyMetrics: BlockedMetrics = {
        workspace: {
          workspaceId: workspace.workspaceId,
        },
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        metrics: {
          blockedCount: 0,
          rejectedImpact: 0,
          avgBlockedConfidence: 0,
          lowConfidenceBlockCount: 0,
          blocksByStage: {
            dependency_validation: {
              count: 0,
              rejectedImpact: 0,
              avgConfidence: 0,
            },
            decision_gate: {
              count: 0,
              rejectedImpact: 0,
              avgConfidence: 0,
            },
            guardrails: {
              count: 0,
              rejectedImpact: 0,
              avgConfidence: 0,
            },
          },
          topGuardrailViolations: [],
          blockReasonsByStage: [],
        },
      };
      return NextResponse.json(emptyMetrics);
    }

    // Calculate metrics
    let totalRejectedImpact = 0;
    let totalConfidence = 0;
    let lowConfidenceCount = 0;
    const blocksByStage: Record<
      "dependency_validation" | "decision_gate" | "guardrails",
      {
        count: number;
        rejectedImpact: number;
        avgConfidence: number;
        confidences: number[];
      }
    > = {
      dependency_validation: {
        count: 0,
        rejectedImpact: 0,
        avgConfidence: 0,
        confidences: [],
      },
      decision_gate: {
        count: 0,
        rejectedImpact: 0,
        avgConfidence: 0,
        confidences: [],
      },
      guardrails: {
        count: 0,
        rejectedImpact: 0,
        avgConfidence: 0,
        confidences: [],
      },
    };

    const blockReasons: Record<
      string,
      {
        examples: Set<string>;
        count: number;
        totalImpact: number;
        confidences: number[];
      }
    > = {};

    const guardrailViolations: Record<
      string,
      {
        count: number;
        totalImpact: number;
      }
    > = {};

    for (const decision of blockedDecisions) {
      const expectedImpact = Number(decision.impactExpected || 0);
      const confidence = Number(decision.confidence || 0);
      const blockStage = (decision.blockStage ||
        "unknown") as keyof typeof blocksByStage;

      totalRejectedImpact += expectedImpact;
      totalConfidence += confidence;

      if (confidence < 0.5) {
        lowConfidenceCount++;
      }

      // Track by stage
      if (blockStage in blocksByStage) {
        blocksByStage[blockStage].count++;
        blocksByStage[blockStage].rejectedImpact += expectedImpact;
        blocksByStage[blockStage].confidences.push(confidence);
      }

      // Track block reasons
      const blockReason = decision.blockReason || "Unknown reason";
      const stageKey = `${blockStage}:${blockReason}`;

      if (!blockReasons[stageKey]) {
        blockReasons[stageKey] = {
          examples: new Set(),
          count: 0,
          totalImpact: 0,
          confidences: [],
        };
      }
      blockReasons[stageKey].examples.add(decision.problem || "");
      blockReasons[stageKey].count++;
      blockReasons[stageKey].totalImpact += expectedImpact;
      blockReasons[stageKey].confidences.push(confidence);

      // Track guardrail violations
      if (blockStage === "guardrails") {
        const guardrailResult = decision.guardrailResult
          ? JSON.parse(String(decision.guardrailResult))
          : { violations: [] };

        if (guardrailResult.violations && Array.isArray(guardrailResult.violations)) {
          for (const violation of guardrailResult.violations) {
            const ruleId = violation.ruleId || "unknown";
            if (!guardrailViolations[ruleId]) {
              guardrailViolations[ruleId] = {
                count: 0,
                totalImpact: 0,
              };
            }
            guardrailViolations[ruleId].count++;
            guardrailViolations[ruleId].totalImpact += expectedImpact;
          }
        }
      }
    }

    // Calculate averages
    const avgBlockedConfidence =
      blockedDecisions.length > 0 ? totalConfidence / blockedDecisions.length : 0;

    // Calculate stage averages
    const blocksByStageOutput: Record<
      "dependency_validation" | "decision_gate" | "guardrails",
      {
        count: number;
        rejectedImpact: number;
        avgConfidence: number;
      }
    > = {
      dependency_validation: {
        count: blocksByStage.dependency_validation.count,
        rejectedImpact: blocksByStage.dependency_validation.rejectedImpact,
        avgConfidence:
          blocksByStage.dependency_validation.confidences.length > 0
            ? (blocksByStage.dependency_validation.confidences.reduce((a, b) => a + b, 0) /
                blocksByStage.dependency_validation.confidences.length)
            : 0,
      },
      decision_gate: {
        count: blocksByStage.decision_gate.count,
        rejectedImpact: blocksByStage.decision_gate.rejectedImpact,
        avgConfidence:
          blocksByStage.decision_gate.confidences.length > 0
            ? (blocksByStage.decision_gate.confidences.reduce((a, b) => a + b, 0) /
                blocksByStage.decision_gate.confidences.length)
            : 0,
      },
      guardrails: {
        count: blocksByStage.guardrails.count,
        rejectedImpact: blocksByStage.guardrails.rejectedImpact,
        avgConfidence:
          blocksByStage.guardrails.confidences.length > 0
            ? (blocksByStage.guardrails.confidences.reduce((a, b) => a + b, 0) /
                blocksByStage.guardrails.confidences.length)
            : 0,
      },
    };

    // Build top guardrail violations
    const topGuardrailViolations: GuardrailViolation[] = Object.entries(
      guardrailViolations
    )
      .map(([ruleId, data]) => ({
        ruleId,
        severity: "block",
        count: data.count,
        totalExpectedImpact: data.totalImpact,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Build block reasons by stage
    const blockReasonsByStage: BlockReasonByStage[] = Object.entries(blockReasons)
      .map(([key, data]) => {
        const [stage, reason] = key.split(":");
        const avgConf =
          data.confidences.length > 0
            ? data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length
            : 0;

        return {
          stage: stage as "dependency_validation" | "decision_gate" | "guardrails",
          reasonExamples: Array.from(data.examples).slice(0, 2),
          count: data.count,
          totalExpectedImpact: data.totalImpact,
          avgConfidence: avgConf,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const metrics: BlockedMetrics = {
      workspace: {
        workspaceId: workspace.workspaceId,
      },
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      metrics: {
        blockedCount: blockedDecisions.length,
        rejectedImpact: totalRejectedImpact,
        avgBlockedConfidence: avgBlockedConfidence,
        lowConfidenceBlockCount: lowConfidenceCount,
        blocksByStage: blocksByStageOutput,
        topGuardrailViolations,
        blockReasonsByStage,
      },
    };

    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
