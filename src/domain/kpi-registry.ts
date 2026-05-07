// KPI Registry: Canonical KPI formula definitions
// Phase 2: Standardize KPI calculations and interpretations

import { z } from 'zod';

export const KPIFormulaType = z.enum([
  'revenue_growth',
  'customer_acquisition_cost',
  'customer_lifetime_value',
  'churn_rate',
  'gross_margin',
  'operating_margin',
  'cash_burn_rate',
  'runway_months',
  'market_share',
  'nps_score',
  'employee_retention',
  'project_utilization',
  'delivery_cycle_time',
  'custom',
]);
export type KPIFormulaType = z.infer<typeof KPIFormulaType>;

export const KPIFormulaSchema = z.object({
  id: z.string().uuid(),
  formulaName: z.string().min(1).max(255),
  formulaType: KPIFormulaType,
  description: z.string().max(1024).nullable().optional(),
  canonicalDefinition: z.string().min(1).max(2048), // How is it calculated
  unit: z.string().min(1).max(50), // e.g., "%", "$", "months", "days"
  direction: z.enum(['up', 'down']), // Is higher better or lower better
  inputParameters: z.array(
    z.object({
      paramName: z.string(),
      paramType: z.enum(['number', 'percentage', 'currency', 'date']),
      required: z.boolean(),
    })
  ),
  standardThreshold: z.object({
    good: z.number().nullable().optional(),
    acceptable: z.number().nullable().optional(),
    warning: z.number().nullable().optional(),
    critical: z.number().nullable().optional(),
  }).nullable().optional(),
  workspaceId: z.string().uuid(),
  isGlobal: z.boolean().default(false), // Provided by system vs custom
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type KPIFormula = z.infer<typeof KPIFormulaSchema>;

export const CreateKPIFormulaRequestSchema = z.object({
  formulaName: z.string().min(1).max(255),
  formulaType: KPIFormulaType,
  description: z.string().max(1024).optional(),
  canonicalDefinition: z.string().min(1).max(2048),
  unit: z.string().min(1).max(50),
  direction: z.enum(['up', 'down']),
  inputParameters: z.array(
    z.object({
      paramName: z.string(),
      paramType: z.enum(['number', 'percentage', 'currency', 'date']),
      required: z.boolean().optional(),
    })
  ).optional(),
  standardThreshold: z.object({
    good: z.number().optional(),
    acceptable: z.number().optional(),
    warning: z.number().optional(),
    critical: z.number().optional(),
  }).optional(),
  isGlobal: z.boolean().optional(),
});

export type CreateKPIFormulaRequest = z.infer<typeof CreateKPIFormulaRequestSchema>;

// Standard global formulas provided by system
export const STANDARD_KPI_FORMULAS: Omit<KPIFormula, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[] = [
  {
    formulaName: 'Revenue Growth %',
    formulaType: 'revenue_growth',
    description: 'Year-over-year or month-over-month revenue growth percentage',
    canonicalDefinition: '((Current Period Revenue - Prior Period Revenue) / Prior Period Revenue) × 100',
    unit: '%',
    direction: 'up',
    inputParameters: [
      { paramName: 'Current Period Revenue', paramType: 'currency', required: true },
      { paramName: 'Prior Period Revenue', paramType: 'currency', required: true },
    ],
    standardThreshold: {
      good: 20,
      acceptable: 10,
      warning: 5,
      critical: -10,
    },
    isGlobal: true,
    version: 1,
  },
  {
    formulaName: 'Customer Acquisition Cost',
    formulaType: 'customer_acquisition_cost',
    description: 'Total sales and marketing spend divided by new customers acquired',
    canonicalDefinition: 'Total Sales & Marketing Spend / New Customers Acquired',
    unit: '$',
    direction: 'down',
    inputParameters: [
      { paramName: 'Sales & Marketing Spend', paramType: 'currency', required: true },
      { paramName: 'New Customers', paramType: 'number', required: true },
    ],
    isGlobal: true,
    version: 1,
  },
  {
    formulaName: 'Monthly Churn Rate',
    formulaType: 'churn_rate',
    description: 'Percentage of customers lost in a month',
    canonicalDefinition: '(Customers Lost in Month / Beginning Month Customers) × 100',
    unit: '%',
    direction: 'down',
    inputParameters: [
      { paramName: 'Customers Lost', paramType: 'number', required: true },
      { paramName: 'Beginning Customers', paramType: 'number', required: true },
    ],
    standardThreshold: {
      good: 2,
      acceptable: 5,
      warning: 10,
      critical: 15,
    },
    isGlobal: true,
    version: 1,
  },
  {
    formulaName: 'Gross Margin %',
    formulaType: 'gross_margin',
    description: 'Revenue minus cost of goods sold, as percentage of revenue',
    canonicalDefinition: '((Revenue - COGS) / Revenue) × 100',
    unit: '%',
    direction: 'up',
    inputParameters: [
      { paramName: 'Revenue', paramType: 'currency', required: true },
      { paramName: 'Cost of Goods Sold', paramType: 'currency', required: true },
    ],
    standardThreshold: {
      good: 60,
      acceptable: 40,
      warning: 25,
      critical: 0,
    },
    isGlobal: true,
    version: 1,
  },
  {
    formulaName: 'Cash Burn Rate',
    formulaType: 'cash_burn_rate',
    description: 'Monthly cash outflow when revenue is insufficient',
    canonicalDefinition: '(Starting Cash - Ending Cash) / Number of Months',
    unit: '$',
    direction: 'down',
    inputParameters: [
      { paramName: 'Starting Cash', paramType: 'currency', required: true },
      { paramName: 'Ending Cash', paramType: 'currency', required: true },
      { paramName: 'Months', paramType: 'number', required: true },
    ],
    isGlobal: true,
    version: 1,
  },
];
