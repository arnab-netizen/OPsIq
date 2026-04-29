/**
 * Variable Registry - Phase 4 Control 1
 *
 * Defines and validates all variables used in the decision system.
 * Enforces strict governance: no unknown variables, no defaults, no AI inference.
 * All variables must be explicitly registered and validated.
 */

export type VariableType = "financial" | "risk" | "temporal" | "operational";

export interface VariableDefinition {
  key: string;
  type: VariableType;
  required: boolean;
  description: string;
  min?: number;
  max?: number;
  dependencies?: string[]; // Variables this depends on
}

export interface RegistryValidationError {
  variable: string;
  error: string;
}

export interface DependencyValidationError {
  status: "blocked";
  reason: "DEPENDENCY_MISSING";
  variable: string;
  missingDependencies: string[];
  details: string;
}

// Governed variable registry - immutable, deterministic
const VARIABLE_REGISTRY: Record<string, VariableDefinition> = {
  baselineRevenue: {
    key: "baselineRevenue",
    type: "financial",
    required: true,
    description: "Baseline revenue in normalized currency (base currency)",
    min: 0,
    dependencies: [],
  },
  baselineCost: {
    key: "baselineCost",
    type: "financial",
    required: true,
    description: "Baseline cost in normalized currency (base currency)",
    min: 0,
    dependencies: [],
  },
  revenueChange: {
    key: "revenueChange",
    type: "financial",
    required: true,
    description: "Expected revenue change in normalized currency (base currency)",
    dependencies: ["baselineRevenue"],
  },
  costChange: {
    key: "costChange",
    type: "financial",
    required: true,
    description: "Expected cost change in normalized currency (base currency)",
    dependencies: ["baselineCost"],
  },
  confidence: {
    key: "confidence",
    type: "risk",
    required: true,
    description: "Confidence score for decision (0.0 to 1.0)",
    min: 0,
    max: 1,
    dependencies: [],
  },
  dueAt: {
    key: "dueAt",
    type: "temporal",
    required: false,
    description: "Due date for decision execution (ISO 8601 timestamp)",
    dependencies: [],
  },
  problemType: {
    key: "problemType",
    type: "operational",
    required: false,
    description: "Type of business problem (e.g., revenue_leak, cost_overrun)",
    dependencies: [],
  },
  decisionType: {
    key: "decisionType",
    type: "operational",
    required: false,
    description: "Type of decision (e.g., approval, rejection, escalation)",
    dependencies: [],
  },
};

/**
 * Validate variable dependencies - fail-closed enforcement.
 *
 * For each variable in input:
 * - If it has declared dependencies, ALL must exist in input
 * - Missing dependencies cause immediate block with detailed error
 * - Sorted dependency list for deterministic errors
 */
export function validateDependencies(
  input: Record<string, unknown>
): { valid: boolean; error?: DependencyValidationError } {
  if (!input || typeof input !== "object") {
    return { valid: true }; // Object validation happens elsewhere
  }

  // Check each variable in input for its dependencies
  for (const [key, _value] of Object.entries(input)) {
    const varDef = VARIABLE_REGISTRY[key];

    // Skip unknown variables (handled by registry validation)
    if (!varDef) {
      continue;
    }

    // Check if this variable has dependencies
    if (varDef.dependencies && varDef.dependencies.length > 0) {
      const missingDeps = varDef.dependencies.filter((dep) => !(dep in input));

      if (missingDeps.length > 0) {
        // Fail-closed: block immediately with explicit error
        return {
          valid: false,
          error: {
            status: "blocked",
            reason: "DEPENDENCY_MISSING",
            variable: key,
            missingDependencies: missingDeps.sort(),
            details: `Variable '${key}' requires ${missingDeps.length} missing dependency(ies): ${missingDeps
              .sort()
              .join(", ")}`,
          },
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Get the complete variable registry.
 * Returns a copy to prevent mutation.
 */
export function getVariableRegistry(): Record<string, VariableDefinition> {
  return Object.freeze({ ...VARIABLE_REGISTRY });
}

/**
 * Get all required variables.
 * Deterministic ordering: filtered and sorted by key.
 */
export function getRequiredVariables(): VariableDefinition[] {
  return Object.values(VARIABLE_REGISTRY)
    .filter((v) => v.required)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get all variables of a specific type.
 */
export function getVariablesByType(type: VariableType): VariableDefinition[] {
  return Object.values(VARIABLE_REGISTRY)
    .filter((v) => v.type === type)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Validate input variables against registry.
 * Fail-closed: strict validation, no defaults, no custom variables unless explicitly allowed.
 *
 * Rules:
 * - All required variables must be present
 * - Unknown variables rejected unless allowCustom=true
 * - Values must match type constraints (min/max)
 * - Dependencies must be present if variable is present
 * - No null/undefined for required variables
 */
export function validateRegisteredVariables(
  input: Record<string, unknown>,
  allowCustom: boolean = false
): { valid: boolean; errors: RegistryValidationError[] } {
  const errors: RegistryValidationError[] = [];

  if (!input || typeof input !== "object") {
    return {
      valid: false,
      errors: [{ variable: "_root", error: "Input must be an object" }],
    };
  }

  // Check for unknown variables
  for (const key of Object.keys(input)) {
    if (!VARIABLE_REGISTRY[key] && !allowCustom) {
      errors.push({
        variable: key,
        error: `Unknown variable: ${key}. Not in registry.`,
      });
    }
  }

  // Check all required variables are present
  for (const varDef of getRequiredVariables()) {
    if (!(varDef.key in input)) {
      errors.push({
        variable: varDef.key,
        error: `Required variable missing: ${varDef.key}`,
      });
    } else if (input[varDef.key] === null || input[varDef.key] === undefined) {
      errors.push({
        variable: varDef.key,
        error: `Required variable cannot be null/undefined: ${varDef.key}`,
      });
    }
  }

  // Validate each variable that is present
  for (const [key, value] of Object.entries(input)) {
    const varDef = VARIABLE_REGISTRY[key];

    if (!varDef) {
      // Skip unknown variables if allowCustom=true (already reported above if false)
      if (allowCustom) {
        continue;
      }
    } else {
      // Type validation
      if (varDef.type === "financial" || varDef.type === "risk") {
        if (typeof value !== "number") {
          errors.push({
            variable: key,
            error: `${varDef.type} variable must be a number, got ${typeof value}`,
          });
        } else {
          // Min/max validation
          if (varDef.min !== undefined && value < varDef.min) {
            errors.push({
              variable: key,
              error: `${key} must be >= ${varDef.min}, got ${value}`,
            });
          }
          if (varDef.max !== undefined && value > varDef.max) {
            errors.push({
              variable: key,
              error: `${key} must be <= ${varDef.max}, got ${value}`,
            });
          }
        }
      } else if (varDef.type === "temporal") {
        if (typeof value !== "string") {
          errors.push({
            variable: key,
            error: `temporal variable must be a string (ISO 8601), got ${typeof value}`,
          });
        } else {
          // Basic ISO 8601 validation
          const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
          if (!isoRegex.test(value)) {
            errors.push({
              variable: key,
              error: `${key} must be ISO 8601 format, got ${value}`,
            });
          }
        }
      } else if (varDef.type === "operational") {
        if (typeof value !== "string") {
          errors.push({
            variable: key,
            error: `operational variable must be a string, got ${typeof value}`,
          });
        }
      }

      // Dependency validation
      if (varDef.dependencies && varDef.dependencies.length > 0) {
        for (const dep of varDef.dependencies) {
          if (!(dep in input)) {
            errors.push({
              variable: key,
              error: `Dependency missing: ${key} requires ${dep}`,
            });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a variable is registered.
 */
export function isVariableRegistered(key: string): boolean {
  return key in VARIABLE_REGISTRY;
}

/**
 * Get a specific variable definition.
 */
export function getVariable(key: string): VariableDefinition | null {
  return VARIABLE_REGISTRY[key] || null;
}
