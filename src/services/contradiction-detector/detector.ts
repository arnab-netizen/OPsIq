import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  DecisionRequestContract,
  decisionRequestContractSchema,
} from "@/domain/validation/contract";
import {
  Contradiction,
  ContradictionDetectionResult,
} from "@/domain/validation/contradiction";
import { ZodError } from "zod/v4";

export class ContradictionDetector {
  async detectContradictions(
    contract: unknown
  ): Promise<ContradictionDetectionResult> {
    const contractId = uuidv4();
    const contradictions: Contradiction[] = [];

    try {
      const validated = decisionRequestContractSchema.parse(contract);

      const detectedContradictions = this.findContradictions(validated);
      contradictions.push(...detectedContradictions);

      const hasContradictions = contradictions.length > 0;

      logger.info("Contradiction detection complete", {
        contractId,
        found: hasContradictions,
        count: contradictions.length,
      });

      return {
        contractId,
        hasContradictions,
        contradictions,
        detectedAt: new Date(),
      };
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const messages = (err as unknown).errors
          ?.map((e: unknown) => e.message)
          .join("; ") || String(err);
        throw new Error(`Invalid contract format: ${messages}`);
      }
      throw err;
    }
  }

  private findContradictions(contract: DecisionRequestContract): Contradiction[] {
    const contradictions: Contradiction[] = [];

    // Check business condition contradictions
    if (contract.businessCondition) {
      const bc = contract.businessCondition;

      if (bc.financialHealth === "CRITICAL" && bc.revenueRun > 10000000) {
        contradictions.push({
          id: uuidv4(),
          field1: "financialHealth",
          field2: "revenueRun",
          description:
            "Critical financial health with high revenue is contradictory",
          severity: "WARNING",
          suggestedResolution: "Verify financial health assessment is accurate",
        });
      }

      if (bc.financialHealth === "STRONG" && bc.revenueRun === 0) {
        contradictions.push({
          id: uuidv4(),
          field1: "financialHealth",
          field2: "revenueRun",
          description: "Strong financial health but zero revenue is contradictory",
          severity: "ERROR",
          suggestedResolution: "Update revenue or financial health assessment",
        });
      }
    }

    // Check constraint contradictions
    if (contract.constraints) {
      const constraints = contract.constraints;

      if (contract.context && contract.context.urgency) {
        if (
          constraints.budgetLimit &&
          constraints.budgetLimit < 10000 &&
          contract.context.urgency === "CRITICAL"
        ) {
          contradictions.push({
            id: uuidv4(),
            field1: "budgetLimit",
            field2: "urgency",
            description:
              "Critical urgency with severely limited budget may be unrealistic",
            severity: "WARNING",
            suggestedResolution:
              "Either increase budget or lower urgency classification",
          });
        }
      }
    }

    // Check context contradictions
    if (contract.context) {
      const context = contract.context;

      if (context.ownerEngagementLevel === "NONE" && context.urgency === "CRITICAL") {
        contradictions.push({
          id: uuidv4(),
          field1: "ownerEngagementLevel",
          field2: "urgency",
          description:
            "Critical urgency requires active owner engagement, but owner has no engagement",
          severity: "ERROR",
          suggestedResolution:
            "Either increase owner engagement or lower urgency classification",
        });
      }
    }

    // Check requestType vs complexity
    if (contract.requestType === "DECISION" && (!contract.context || !contract.constraints)) {
      contradictions.push({
        id: uuidv4(),
        field1: "requestType",
        field2: "context/constraints",
        description:
          "Decision requests should include context and constraints for proper analysis",
        severity: "WARNING",
        suggestedResolution: "Provide context and constraints for better decision support",
      });
    }

    return contradictions;
  }

  async detectAndThrow(contract: unknown): Promise<DecisionRequestContract> {
    const result = await this.detectContradictions(contract);

    if (result.hasContradictions) {
      const errors = result.contradictions
        .filter((c) => c.severity === "ERROR")
        .map((c) => `${c.field1} vs ${c.field2}: ${c.description}`);

      if (errors.length > 0) {
        throw new Error(
          `Contract contradictions detected: ${errors.join("; ")}`
        );
      }
    }

    const validated = decisionRequestContractSchema.parse(contract);
    return validated;
  }
}

export const contradictionDetector = new ContradictionDetector();
