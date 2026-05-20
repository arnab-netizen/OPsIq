import { z, ZodError } from "zod/v4";
import { logger } from "@/infra/logger";
import {
  decisionRequestContractSchema,
  DecisionRequestContract,
  ValidationContractResult,
  ValidationError,
} from "@/domain/validation/contract";
import { v4 as uuidv4 } from "uuid";
import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

export class ContractValidator {
  async validateContract(input: unknown): Promise<ValidationContractResult> {
    const contractId = uuidv4();
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      const validated = decisionRequestContractSchema.parse(input);
      logger.info("Contract validation passed", { contractId, input: validated });

      return {
        isValid: true,
        contractId,
        errors: [],
        warnings: [],
        validatedAt: new Date(),
      };
    } catch (err) {
      if (err instanceof ZodError && err.issues) {
        err.issues.forEach((error) => {
          const field = error.path ? error.path.join(".") : "root";
          errors.push({
            field: field || "root",
            message: error.message,
            severity: "ERROR",
          });
        });
      } else {
        errors.push({
          field: "root",
          message: getSafeErrorMessage(err),
          severity: "ERROR",
        });
      }

      logger.warn("Contract validation failed", {
        contractId,
        errorCount: errors.length,
      });

      return {
        isValid: false,
        contractId,
        errors,
        warnings,
        validatedAt: new Date(),
      };
    }
  }

  async validateAndThrow(input: unknown): Promise<DecisionRequestContract> {
    const result = await this.validateContract(input);
    if (!result.isValid) {
      const errorMessages = result.errors.map((e) => `${e.field}: ${e.message}`);
      throw new Error(`Contract validation failed: ${errorMessages.join("; ")}`);
    }
    return input as DecisionRequestContract;
  }
}

export const contractValidator = new ContractValidator();
