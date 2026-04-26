import { z } from "zod";

export const FindingCategorySchema = z.enum([
  "operations",
  "finance",
  "supply",
  "sales",
  "people",
]);

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const IntakeFindingSchema = z.object({
  category: FindingCategorySchema.describe(
    "Category of finding: operations, finance, supply, sales, or people"
  ),
  description: z.string().min(10, "Finding description must be at least 10 characters").describe("Detailed description of the finding"),
  severity: SeveritySchema.describe("Severity level of the finding"),
});

export const IntakeInputSchema = z.object({
  clientName: z
    .string()
    .min(2, "Client name must be at least 2 characters")
    .describe("Name of the client business"),

  industry: z
    .string()
    .min(2, "Industry must be specified")
    .describe("Industry or business sector (e.g., Manufacturing, Retail, Tech)"),

  problemSummary: z
    .string()
    .min(20, "Problem summary must be at least 20 characters")
    .describe("Concise summary of the primary business problem"),

  revenueImpact: z
    .number()
    .positive("Revenue impact must be positive")
    .optional()
    .describe("Estimated financial impact in dollars"),

  timeToFailure: z
    .number()
    .positive("Time to failure must be positive")
    .optional()
    .describe("Estimated days until business failure if unresolved"),

  findings: z
    .array(IntakeFindingSchema)
    .min(1, "At least one finding must be provided")
    .max(10, "Maximum 10 findings per intake")
    .describe("Array of categorized findings"),
});

export type FindingCategory = z.infer<typeof FindingCategorySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type IntakeFinding = z.infer<typeof IntakeFindingSchema>;
export type IntakeInput = z.infer<typeof IntakeInputSchema>;

export function validateIntakeInput(data: unknown): IntakeInput {
  return IntakeInputSchema.parse(data);
}

export function isValidFindingCategory(value: string): value is FindingCategory {
  return FindingCategorySchema.safeParse(value).success;
}

export function isValidSeverity(value: string): value is Severity {
  return SeveritySchema.safeParse(value).success;
}

export function formatFindingCategory(category: FindingCategory): string {
  const categoryLabels: { [key in FindingCategory]: string } = {
    operations: "Operations",
    finance: "Finance",
    supply: "Supply Chain",
    sales: "Sales & Market",
    people: "People & Culture",
  };
  return categoryLabels[category];
}

export function getCategoryDescription(category: FindingCategory): string {
  const descriptions: { [key in FindingCategory]: string } = {
    operations: "Operational processes, efficiency, production, quality control",
    finance: "Cash flow, profitability, financial controls, accounting",
    supply: "Supply chain, vendors, procurement, logistics",
    sales: "Sales performance, market position, customer retention, pricing",
    people: "Staffing, turnover, skills, management, culture",
  };
  return descriptions[category];
}

export function getSeverityColor(severity: Severity): string {
  const colors: { [key in Severity]: string } = {
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    critical: "🔴",
  };
  return colors[severity];
}

export function prioritizeFindings(findings: IntakeFinding[]): IntakeFinding[] {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...findings].sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      findings.indexOf(a) - findings.indexOf(b)
  );
}
