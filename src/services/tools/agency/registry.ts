/**
 * Single source of truth for the public calculator suite: routes, titles, descriptions, categories and related links.
 * Used by the hub page, every tool page, the sitemap and the analytics path allowlist, so they cannot drift apart.
 * Serializable data only (no functions), so it is safe to import from server and client code.
 */

export const TOOLS_HUB_PATH = "/tools";
export const PROFIT_MARGIN_TOOL_PATH = "/tools/profit-margin-calculator";
export const AGENCY_DIAGNOSTIC_PATH = "/agency";

export type AgencyToolId =
  | "client-profitability"
  | "retainer-pricing"
  | "utilization"
  | "scope-creep"
  | "hourly-rate"
  | "capacity";

/** Calculator ids that may appear in analytics events (the six new tools plus the existing profit-margin calculator and hub). */
export type AnalyticsToolId = AgencyToolId | "profit-margin" | "hub";

export type ToolCategory = "Agency Pricing and Profitability" | "Agency Operations" | "General Business Finance";

export type AgencyToolMeta = {
  id: AgencyToolId;
  path: string;
  /** 60 characters or fewer. */
  title: string;
  /** 155 characters or fewer. */
  description: string;
  h1: string;
  /** Short card text for the hub. */
  cardText: string;
  category: ToolCategory;
  related: AgencyToolId[];
  /** Existing resource article slugs that genuinely cover the same topic. */
  resources: string[];
};

export const AGENCY_TOOLS: ReadonlyArray<AgencyToolMeta> = [
  {
    id: "client-profitability",
    path: "/tools/client-profitability-calculator",
    title: "Client Profitability Calculator for Agencies | OpsIQ",
    description: "Free calculator: agency gross income, delivery profit, delivery margin and effective hourly rate for one client, plus the fee needed to reach your target.",
    h1: "Client Profitability Calculator for Agencies",
    cardText: "Delivery profit, delivery margin and earned hourly rate for one client, with the fee or cost change needed to hit your target.",
    category: "Agency Pricing and Profitability",
    related: ["retainer-pricing", "scope-creep", "hourly-rate"],
    resources: ["hours-logged-vs-hours-scoped-overservicing", "which-agency-number-to-fix-first"],
  },
  {
    id: "retainer-pricing",
    path: "/tools/agency-retainer-pricing-calculator",
    title: "Agency Retainer Pricing Calculator | OpsIQ",
    description: "Free calculator: the delivery break-even fee, target agency fee, client invoice and sustainable hours for a monthly retainer at your target margin.",
    h1: "Agency Retainer Pricing Calculator",
    cardText: "Delivery break-even fee, target fee, client invoice and the hours a retainer can sustain at your target delivery margin.",
    category: "Agency Pricing and Profitability",
    related: ["client-profitability", "scope-creep", "hourly-rate"],
    resources: ["hours-logged-vs-hours-scoped-overservicing", "which-agency-number-to-fix-first"],
  },
  {
    id: "utilization",
    path: "/tools/agency-utilization-calculator",
    title: "Agency Billable Utilization Calculator | OpsIQ",
    description: "Free calculator: utilization against paid capacity and against available capacity, hours above or below target, with every denominator stated.",
    h1: "Agency Billable Utilization Calculator",
    cardText: "Utilization against paid and available capacity, target hours, and hours above or below your target.",
    category: "Agency Operations",
    related: ["capacity", "hourly-rate", "client-profitability"],
    resources: ["agency-utilization-rate-denominator", "which-agency-number-to-fix-first"],
  },
  {
    id: "scope-creep",
    path: "/tools/agency-scope-creep-calculator",
    title: "Scope Creep and Overservicing Calculator | OpsIQ",
    description: "Free calculator: how unpriced extra hours erode delivery margin, what you absorbed, and what a change order would need to charge to protect it.",
    h1: "Scope Creep and Overservicing Calculator",
    cardText: "Margin erosion from unpriced extra work, the cost you absorbed, and change-order pricing at your chosen margin.",
    category: "Agency Pricing and Profitability",
    related: ["client-profitability", "retainer-pricing", "capacity"],
    resources: ["hours-logged-vs-hours-scoped-overservicing", "which-agency-number-to-fix-first"],
  },
  {
    id: "hourly-rate",
    path: "/tools/agency-hourly-rate-calculator",
    title: "Agency Hourly Rate Calculator | OpsIQ",
    description: "Free calculator: the break-even and required earned hourly rate for an agency, from payroll, overhead, capacity, utilization and target margin.",
    h1: "Agency Hourly Rate Calculator",
    cardText: "Break-even and required earned hourly rate from payroll, overhead, capacity, utilization and target operating margin.",
    category: "Agency Pricing and Profitability",
    related: ["utilization", "retainer-pricing", "client-profitability"],
    resources: ["agency-utilization-rate-denominator", "which-agency-number-to-fix-first"],
  },
  {
    id: "capacity",
    path: "/tools/agency-capacity-calculator",
    title: "Agency Capacity Planning Calculator | OpsIQ",
    description: "Free calculator: target delivery capacity, committed hours, remaining capacity or shortfall, and how many more clients your team could support.",
    h1: "Agency Capacity Planning Calculator",
    cardText: "Target capacity, committed hours, remaining capacity or shortfall, and additional clients your team could support.",
    category: "Agency Operations",
    related: ["utilization", "scope-creep", "hourly-rate"],
    resources: ["agency-utilization-rate-denominator", "which-agency-number-to-fix-first"],
  },
];

export const AGENCY_TOOL_IDS: ReadonlyArray<AgencyToolId> = AGENCY_TOOLS.map((t) => t.id);

export function getAgencyTool(id: AgencyToolId): AgencyToolMeta {
  const tool = AGENCY_TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown agency tool: ${id}`);
  return tool;
}

/** Every public tool route (hub, existing calculator, six new calculators). Used by the analytics allowlist and the sitemap. */
export const PUBLIC_TOOL_PATHS: ReadonlyArray<string> = [TOOLS_HUB_PATH, PROFIT_MARGIN_TOOL_PATH, ...AGENCY_TOOLS.map((t) => t.path)];

export const TOOL_CATEGORIES: ReadonlyArray<ToolCategory> = ["Agency Pricing and Profitability", "Agency Operations", "General Business Finance"];
