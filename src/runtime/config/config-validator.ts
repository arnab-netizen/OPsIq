/**
 * PHASE I-7: RUNTIME CONFIG VALIDATION
 *
 * Startup validation, environment verification, missing secret detection.
 * App must refuse unsafe startup.
 */

import { z } from "zod";

export interface ValidationError {
  field: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const RuntimeConfigSchema = z.object({
  // Core
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database
  DATABASE_URL: z.string().url().optional(),

  // Queue
  QUEUE_URL: z.string().url().optional(),

  // Security
  JWT_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Services
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ENABLE_STRUCTURED_LOGGING: z.string().default("true").transform((v) => v === "true"),

  // Limits
  MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(100),
  MAX_QUEUE_SIZE: z.coerce.number().int().positive().default(1000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Health
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(10000),

  // Deployment
  DEPLOYMENT_ID: z.string().optional(),
  DEPLOYMENT_TIMESTAMP: z.string().optional(),
});

class ConfigValidator {
  validateStartup(): ConfigValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check NODE_ENV
    if (!["development", "production", "test"].includes(process.env.NODE_ENV || "")) {
      errors.push({
        field: "NODE_ENV",
        message: `NODE_ENV must be one of: development, production, test (got: ${process.env.NODE_ENV || "unset"})`,
        severity: "ERROR",
      });
    }

    // Check production-specific requirements
    if (process.env.NODE_ENV === "production") {
      if (!process.env.DATABASE_URL) {
        errors.push({
          field: "DATABASE_URL",
          message: "DATABASE_URL is required in production",
          severity: "ERROR",
        });
      }

      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        errors.push({
          field: "JWT_SECRET",
          message: "JWT_SECRET must be set and at least 32 characters in production",
          severity: "ERROR",
        });
      }

      if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
        errors.push({
          field: "ENCRYPTION_KEY",
          message: "ENCRYPTION_KEY must be set and at least 32 characters in production",
          severity: "ERROR",
        });
      }

      if (!process.env.STRIPE_API_KEY) {
        warnings.push({
          field: "STRIPE_API_KEY",
          message: "STRIPE_API_KEY not configured - billing features disabled",
          severity: "WARNING",
        });
      }
    }

    // Check port validity
    const port = parseInt(process.env.PORT || "3000");
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push({
        field: "PORT",
        message: `PORT must be a number between 1 and 65535 (got: ${process.env.PORT || "unset"})`,
        severity: "ERROR",
      });
    }

    // Check timeouts are reasonable
    const timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || "30000");
    if (timeout < 1000 || timeout > 300000) {
      warnings.push({
        field: "REQUEST_TIMEOUT_MS",
        message: `REQUEST_TIMEOUT_MS should be between 1000 and 300000 ms (got: ${timeout})`,
        severity: "WARNING",
      });
    }

    // Check memory limits
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_REQUESTS || "100");
    if (maxConcurrent > 10000) {
      warnings.push({
        field: "MAX_CONCURRENT_REQUESTS",
        message: `MAX_CONCURRENT_REQUESTS very high (${maxConcurrent}) - may cause memory issues`,
        severity: "WARNING",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateEnvironment(): ConfigValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for required env vars that might be secrets
    const secretFields = [
      "JWT_SECRET",
      "ENCRYPTION_KEY",
      "STRIPE_API_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "DATABASE_URL",
      "QUEUE_URL",
    ];

    for (const field of secretFields) {
      if (!process.env[field]) {
        // Only error if required
        if (["JWT_SECRET", "ENCRYPTION_KEY"].includes(field)) {
          errors.push({
            field,
            message: `Secret ${field} not configured`,
            severity: "ERROR",
          });
        } else {
          warnings.push({
            field,
            message: `Optional service ${field} not configured`,
            severity: "WARNING",
          });
        }
      }
    }

    // Check for invalid config combinations
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("postgres")) {
      warnings.push({
        field: "DATABASE_URL",
        message: "Expected PostgreSQL database - other databases may not be fully supported",
        severity: "WARNING",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateUnsafeProduction(): ValidationError[] {
    const errors: ValidationError[] = [];

    if (process.env.NODE_ENV !== "production") {
      return errors;
    }

    // Check for development config in production
    if (process.env.LOG_LEVEL === "debug") {
      errors.push({
        field: "LOG_LEVEL",
        message: "LOG_LEVEL is set to debug in production - reduces security",
        severity: "ERROR",
      });
    }

    // Check JWT secret strength
    const jwtSecret = process.env.JWT_SECRET || "";
    if (jwtSecret.length < 64) {
      errors.push({
        field: "JWT_SECRET",
        message: "JWT_SECRET should be at least 64 characters for production",
        severity: "ERROR",
      });
    }

    // Check for hardcoded credentials
    if (
      process.env.DATABASE_URL &&
      (process.env.DATABASE_URL.includes("postgres:postgres") ||
        process.env.DATABASE_URL.includes("root:root"))
    ) {
      errors.push({
        field: "DATABASE_URL",
        message: "Default credentials detected in DATABASE_URL - security risk in production",
        severity: "ERROR",
      });
    }

    return errors;
  }

  getValidationReport(): string {
    const startup = this.validateStartup();
    const environment = this.validateEnvironment();
    const unsafeProduction = this.validateUnsafeProduction();

    let report = "Configuration Validation Report\n";
    report += "================================\n\n";

    // Startup validation
    report += "Startup Validation:\n";
    if (startup.valid && startup.warnings.length === 0) {
      report += "  ✓ All startup checks passed\n";
    } else {
      if (startup.errors.length > 0) {
        report += "  Errors:\n";
        for (const error of startup.errors) {
          report += `    - ${error.field}: ${error.message}\n`;
        }
      }
      if (startup.warnings.length > 0) {
        report += "  Warnings:\n";
        for (const warning of startup.warnings) {
          report += `    - ${warning.field}: ${warning.message}\n`;
        }
      }
    }

    // Environment validation
    report += "\nEnvironment Validation:\n";
    if (environment.valid && environment.warnings.length === 0) {
      report += "  ✓ All environment checks passed\n";
    } else {
      if (environment.errors.length > 0) {
        report += "  Errors:\n";
        for (const error of environment.errors) {
          report += `    - ${error.field}: ${error.message}\n`;
        }
      }
      if (environment.warnings.length > 0) {
        report += "  Warnings:\n";
        for (const warning of environment.warnings) {
          report += `    - ${warning.field}: ${warning.message}\n`;
        }
      }
    }

    // Production safety
    if (process.env.NODE_ENV === "production") {
      report += "\nProduction Safety Checks:\n";
      if (unsafeProduction.length === 0) {
        report += "  ✓ All production safety checks passed\n";
      } else {
        for (const error of unsafeProduction) {
          report += `    - ${error.field}: ${error.message}\n`;
        }
      }
    }

    report += "\nOverall Status: ";
    const allErrors = [...startup.errors, ...environment.errors, ...unsafeProduction];
    if (allErrors.length === 0) {
      report += "✓ VALID - Safe to start\n";
    } else {
      report += `✗ INVALID - ${allErrors.length} error(s) block startup\n`;
    }

    return report;
  }

  requireValidStartup(): void {
    const startup = this.validateStartup();
    const unsafeProduction = this.validateUnsafeProduction();

    const allErrors = [...startup.errors, ...unsafeProduction];
    if (allErrors.length > 0) {
      const errorMessages = allErrors
        .map((e) => `  ${e.field}: ${e.message}`)
        .join("\n");
      throw new Error(
        `Configuration validation failed - startup blocked:\n${errorMessages}`,
      );
    }
  }
}

export const configValidator = new ConfigValidator();
