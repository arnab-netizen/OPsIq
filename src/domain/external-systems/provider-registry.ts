/**
 * B12-S1: External Systems Provider Registry
 *
 * Pure-function provider registry and standard templates for major CRM/accounting platforms.
 * Defines expected columns, required fields, and field mappings for:
 * - HubSpot contacts/deals
 * - Salesforce opportunities
 * - Zoho CRM leads/deals
 * - Pipedrive deals
 * - Shopify orders
 * - Google Ads campaigns
 * - Meta Ads campaigns
 * - QuickBooks/Xero P&L exports
 * - Generic unknown export fallback
 *
 * No DB access. Pure data structure definitions.
 */

export type ProviderCategory = "CRM" | "accounting" | "POS" | "ads" | "ecommerce";

export interface Provider {
  id: string;
  name: string;
  category: ProviderCategory;
  isActive: boolean;
}

export interface FieldMapping {
  sourceField: string; // Provider's field name
  targetField: string; // Business fact field (metric, value, currency, etc.)
  transformationRule?: {
    type: "passthrough" | "multiply" | "divide" | "map" | "parse_date";
    factor?: number; // For multiply/divide
    mapping?: Record<string, string>; // For categorical mapping
    format?: string; // For date parsing
  };
  confidence: number; // 0.0-1.0, used for data quality scoring
}

export interface ImportTemplate {
  providerId: string;
  templateName: string;
  description: string;
  expectedColumns: string[]; // CSV headers expected
  requiredColumns: string[]; // Must be present
  fieldMappings: Record<string, FieldMapping>; // { csv_column: { targetField, confidence, ... } }
}

// ========== PROVIDER REGISTRY ==========

export const PROVIDERS: Record<string, Provider> = {
  HUBSPOT: {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    isActive: true,
  },
  SALESFORCE: {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM",
    isActive: true,
  },
  ZOHO_LEADS: {
    id: "zoho_crm_leads",
    name: "Zoho CRM Leads",
    category: "CRM",
    isActive: true,
  },
  PIPEDRIVE_DEALS: {
    id: "pipedrive_deals",
    name: "Pipedrive Deals",
    category: "CRM",
    isActive: true,
  },
  SHOPIFY: {
    id: "shopify",
    name: "Shopify",
    category: "ecommerce",
    isActive: true,
  },
  GOOGLE_ADS: {
    id: "google_ads",
    name: "Google Ads",
    category: "ads",
    isActive: true,
  },
  META_ADS: {
    id: "meta_ads",
    name: "Meta Ads",
    category: "ads",
    isActive: true,
  },
  QUICKBOOKS: {
    id: "quickbooks",
    name: "QuickBooks",
    category: "accounting",
    isActive: true,
  },
  XERO: {
    id: "xero",
    name: "Xero",
    category: "accounting",
    isActive: true,
  },
  GENERIC: {
    id: "generic",
    name: "Generic Export",
    category: "CRM",
    isActive: true,
  },
};

// ========== STANDARD TEMPLATES ==========

export const TEMPLATES: Record<string, ImportTemplate> = {
  HUBSPOT_DEALS: {
    providerId: "hubspot",
    templateName: "HubSpot Deals Export",
    description: "Deal records from HubSpot CRM with revenue, stage, and close date",
    expectedColumns: ["Deal ID", "Deal Name", "Deal Amount", "Deal Stage", "Close Date", "Owner", "Pipeline"],
    requiredColumns: ["Deal ID", "Deal Amount", "Deal Stage"],
    fieldMappings: {
      "Deal ID": {
        sourceField: "Deal ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      "Deal Name": {
        sourceField: "Deal Name",
        targetField: "metric_description",
        transformationRule: { type: "passthrough" },
        confidence: 0.9,
      },
      "Deal Amount": {
        sourceField: "Deal Amount",
        targetField: "value",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      "Deal Stage": {
        sourceField: "Deal Stage",
        targetField: "stage",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      "Close Date": {
        sourceField: "Close Date",
        targetField: "period_end",
        transformationRule: { type: "parse_date", format: "YYYY-MM-DD" },
        confidence: 0.9,
      },
    },
  },

  SALESFORCE_OPPORTUNITIES: {
    providerId: "salesforce",
    templateName: "Salesforce Opportunities",
    description: "Opportunity records from Salesforce with amount, stage, and close date",
    expectedColumns: ["Id", "Name", "Amount", "StageName", "CloseDate", "OwnerId"],
    requiredColumns: ["Id", "Amount", "StageName"],
    fieldMappings: {
      Id: {
        sourceField: "Id",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Name: {
        sourceField: "Name",
        targetField: "metric_description",
        transformationRule: { type: "passthrough" },
        confidence: 0.9,
      },
      Amount: {
        sourceField: "Amount",
        targetField: "value",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      StageName: {
        sourceField: "StageName",
        targetField: "stage",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      CloseDate: {
        sourceField: "CloseDate",
        targetField: "period_end",
        transformationRule: { type: "parse_date", format: "YYYY-MM-DD" },
        confidence: 0.9,
      },
    },
  },

  SHOPIFY_ORDERS: {
    providerId: "shopify",
    templateName: "Shopify Orders Export",
    description: "Order records from Shopify with order ID, amount, date, and customer info",
    expectedColumns: ["Order ID", "Order Date", "Total", "Currency", "Items", "Customer Name"],
    requiredColumns: ["Order ID", "Total", "Order Date"],
    fieldMappings: {
      "Order ID": {
        sourceField: "Order ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Total: {
        sourceField: "Total",
        targetField: "value",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Currency: {
        sourceField: "Currency",
        targetField: "currency",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      "Order Date": {
        sourceField: "Order Date",
        targetField: "period_end",
        transformationRule: { type: "parse_date", format: "YYYY-MM-DD HH:mm:ss" },
        confidence: 0.9,
      },
      Items: {
        sourceField: "Items",
        targetField: "item_count",
        transformationRule: { type: "passthrough" },
        confidence: 0.8,
      },
    },
  },

  QUICKBOOKS_PL: {
    providerId: "quickbooks",
    templateName: "QuickBooks P&L Export",
    description: "Profit & Loss statement from QuickBooks with revenue, expenses, and net income",
    expectedColumns: ["Account ID", "Account", "Type", "Amount", "Month", "Year"],
    requiredColumns: ["Account", "Type", "Amount"],
    fieldMappings: {
      "Account ID": {
        sourceField: "Account ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Account: {
        sourceField: "Account",
        targetField: "metric",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Type: {
        sourceField: "Type",
        targetField: "account_type",
        transformationRule: {
          type: "map",
          mapping: {
            Income: "revenue",
            Expense: "cost",
            "Cost of Goods Sold": "cogs",
            "Operating Expense": "opex",
          },
        },
        confidence: 0.9,
      },
      Amount: {
        sourceField: "Amount",
        targetField: "value",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Month: {
        sourceField: "Month",
        targetField: "period_month",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Year: {
        sourceField: "Year",
        targetField: "period_year",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
    },
  },

  GOOGLE_ADS_CAMPAIGNS: {
    providerId: "google_ads",
    templateName: "Google Ads Campaigns",
    description: "Campaign performance from Google Ads with impressions, clicks, spend, conversions",
    expectedColumns: ["Campaign ID", "Campaign Name", "Impressions", "Clicks", "Cost", "Conversions", "Date"],
    requiredColumns: ["Campaign ID", "Cost", "Clicks"],
    fieldMappings: {
      "Campaign ID": {
        sourceField: "Campaign ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      "Campaign Name": {
        sourceField: "Campaign Name",
        targetField: "campaign_name",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Impressions: {
        sourceField: "Impressions",
        targetField: "impressions",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Clicks: {
        sourceField: "Clicks",
        targetField: "clicks",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Cost: {
        sourceField: "Cost",
        targetField: "spend",
        transformationRule: { type: "divide", factor: 1000000 }, // Google Ads uses micros
        confidence: 0.95,
      },
      Conversions: {
        sourceField: "Conversions",
        targetField: "conversions",
        transformationRule: { type: "passthrough" },
        confidence: 0.9,
      },
      Date: {
        sourceField: "Date",
        targetField: "period_date",
        transformationRule: { type: "parse_date", format: "YYYY-MM-DD" },
        confidence: 1.0,
      },
    },
  },

  ZOHO_LEADS: {
    providerId: "zoho_crm_leads",
    templateName: "Zoho CRM Leads",
    description: "Lead records from Zoho CRM with contact info and lead status",
    expectedColumns: ["Lead ID", "Lead Name", "Email", "Phone", "Lead Status", "Company"],
    requiredColumns: ["Lead ID", "Lead Status"],
    fieldMappings: {
      "Lead ID": {
        sourceField: "Lead ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      "Lead Name": {
        sourceField: "Lead Name",
        targetField: "contact_name",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Email: {
        sourceField: "Email",
        targetField: "contact_email",
        transformationRule: { type: "passthrough" },
        confidence: 0.9,
      },
      Phone: {
        sourceField: "Phone",
        targetField: "contact_phone",
        transformationRule: { type: "passthrough" },
        confidence: 0.9,
      },
      "Lead Status": {
        sourceField: "Lead Status",
        targetField: "status",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Company: {
        sourceField: "Company",
        targetField: "company_name",
        transformationRule: { type: "passthrough" },
        confidence: 0.85,
      },
    },
  },

  PIPEDRIVE_DEALS_TEMPLATE: {
    providerId: "pipedrive_deals",
    templateName: "Pipedrive Deals",
    description: "Deal records from Pipedrive with deal value, stage, and owner",
    expectedColumns: ["ID", "Title", "Value", "Currency", "Status", "Owner Name", "Add Time"],
    requiredColumns: ["ID", "Value"],
    fieldMappings: {
      ID: {
        sourceField: "ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Title: {
        sourceField: "Title",
        targetField: "deal_title",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Value: {
        sourceField: "Value",
        targetField: "value",
        transformationRule: { type: "passthrough" },
        confidence: 1.0,
      },
      Currency: {
        sourceField: "Currency",
        targetField: "currency",
        transformationRule: { type: "passthrough" },
        confidence: 0.95,
      },
      Status: {
        sourceField: "Status",
        targetField: "stage",
        transformationRule: { type: "passthrough" },
        confidence: 0.9,
      },
      "Owner Name": {
        sourceField: "Owner Name",
        targetField: "owner",
        transformationRule: { type: "passthrough" },
        confidence: 0.85,
      },
    },
  },

  GENERIC_EXPORT: {
    providerId: "generic",
    templateName: "Generic Export",
    description: "Generic fallback template for unknown exports. Maps first columns to fact fields.",
    expectedColumns: ["ID", "Date", "Amount", "Description"],
    requiredColumns: ["ID", "Amount"],
    fieldMappings: {
      ID: {
        sourceField: "ID",
        targetField: "source_reference_id",
        transformationRule: { type: "passthrough" },
        confidence: 0.8,
      },
      Date: {
        sourceField: "Date",
        targetField: "period_end",
        transformationRule: { type: "parse_date", format: "YYYY-MM-DD" },
        confidence: 0.7,
      },
      Amount: {
        sourceField: "Amount",
        targetField: "value",
        transformationRule: { type: "passthrough" },
        confidence: 0.8,
      },
      Description: {
        sourceField: "Description",
        targetField: "description",
        transformationRule: { type: "passthrough" },
        confidence: 0.7,
      },
    },
  },
};

/**
 * Retrieves template for a provider
 */
export function getProviderTemplate(providerId: string, templateName?: string): ImportTemplate | null {
  const templateKey = Object.keys(TEMPLATES).find(
    (key) =>
      TEMPLATES[key as keyof typeof TEMPLATES].providerId === providerId &&
      (!templateName || TEMPLATES[key as keyof typeof TEMPLATES].templateName === templateName),
  );
  return templateKey ? TEMPLATES[templateKey as keyof typeof TEMPLATES] : null;
}

/**
 * Lists all active providers
 */
export function listActiveProviders(): Provider[] {
  return Object.values(PROVIDERS).filter((p) => p.isActive);
}

/**
 * Lists all templates for a provider
 */
export function listProviderTemplates(providerId: string): ImportTemplate[] {
  return Object.values(TEMPLATES).filter((t) => t.providerId === providerId);
}

/**
 * Gets provider by ID
 */
export function getProvider(providerId: string): Provider | null {
  return PROVIDERS[providerId.toUpperCase() as keyof typeof PROVIDERS] || null;
}
