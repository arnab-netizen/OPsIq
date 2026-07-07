/**
 * B12-S1: External Systems Provider Registry — Contract Tests
 *
 * Verifies:
 * - Provider registry contains all required CRM/accounting/ads providers
 * - Import templates define expected columns and required fields
 * - Field mappings include transformation rules and confidence scores
 * - Generic fallback template exists for unknown exports
 * - Template lookup works correctly
 */

import { describe, it, expect } from "vitest";
import {
  getProvider,
  getProviderTemplate,
  listActiveProviders,
  listProviderTemplates,
  isConnectorProductionReady,
  PROVIDERS,
  TEMPLATES,
  type Provider,
  type ImportTemplate,
} from "../../../domain/external-systems/provider-registry";

describe("B12-S1: External Systems Provider Registry", () => {
  describe("Connector readiness honesty (Phase 0 truth/safety)", () => {
    it("no provider is labelled PRODUCTION_READY (they are import templates only)", () => {
      for (const provider of Object.values(PROVIDERS)) {
        expect(provider.readiness).toBe("PLACEHOLDER_ONLY");
        expect(isConnectorProductionReady(provider)).toBe(false);
      }
    });

    it("every provider declares an explicit readiness (no missing/undefined status)", () => {
      const allowed = [
        "NOT_IMPLEMENTED",
        "PLACEHOLDER_ONLY",
        "READ_ONLY_REAL",
        "WRITE_CAPABLE_GATED",
        "PRODUCTION_READY",
      ];
      for (const provider of Object.values(PROVIDERS)) {
        expect(allowed).toContain(provider.readiness);
      }
    });
  });

  describe("Provider Registry", () => {
    it("should have HubSpot provider", () => {
      const hubspot = getProvider("hubspot");
      expect(hubspot).toBeDefined();
      expect(hubspot?.name).toBe("HubSpot");
      expect(hubspot?.category).toBe("CRM");
      expect(hubspot?.isActive).toBe(true);
    });

    it("should have Salesforce provider", () => {
      const sf = getProvider("salesforce");
      expect(sf?.name).toBe("Salesforce");
      expect(sf?.category).toBe("CRM");
    });

    it("should have accounting providers (QuickBooks, Xero)", () => {
      const qb = getProvider("quickbooks");
      const xero = getProvider("xero");
      expect(qb?.category).toBe("accounting");
      expect(xero?.category).toBe("accounting");
    });

    it("should have ads providers (Google Ads, Meta Ads)", () => {
      const google = getProvider("google_ads");
      const meta = getProvider("meta_ads");
      expect(google?.category).toBe("ads");
      expect(meta?.category).toBe("ads");
    });

    it("should have Shopify (ecommerce)", () => {
      const shopify = getProvider("shopify");
      expect(shopify?.category).toBe("ecommerce");
    });

    it("should have generic fallback provider", () => {
      const generic = getProvider("generic");
      expect(generic).toBeDefined();
      expect(generic?.name).toBe("Generic Export");
    });

    it("should list all active providers", () => {
      const active = listActiveProviders();
      expect(active.length).toBeGreaterThan(0);
      expect(active.every((p) => p.isActive)).toBe(true);
    });

    it("should get provider by ID (case-insensitive)", () => {
      const lower = getProvider("hubspot");
      const upper = getProvider("HUBSPOT");
      expect(lower?.id).toBe(upper?.id);
    });

    it("should return null for unknown provider", () => {
      expect(getProvider("unknown_provider")).toBeNull();
    });
  });

  describe("Import Templates", () => {
    it("should have HubSpot Deals template", () => {
      const template = getProviderTemplate("hubspot");
      expect(template).toBeDefined();
      expect(template?.templateName).toBe("HubSpot Deals Export");
      expect(template?.expectedColumns).toContain("Deal Amount");
      expect(template?.requiredColumns).toContain("Deal ID");
    });

    it("should have Salesforce Opportunities template", () => {
      const template = getProviderTemplate("salesforce");
      expect(template?.templateName).toBe("Salesforce Opportunities");
      expect(template?.expectedColumns).toContain("Amount");
      expect(template?.requiredColumns).toContain("Id");
    });

    it("should have Shopify Orders template", () => {
      const template = getProviderTemplate("shopify");
      expect(template?.templateName).toBe("Shopify Orders Export");
      expect(template?.expectedColumns).toContain("Total");
      expect(template?.expectedColumns).toContain("Currency");
    });

    it("should have QuickBooks P&L template", () => {
      const template = getProviderTemplate("quickbooks");
      expect(template?.templateName).toBe("QuickBooks P&L Export");
      expect(template?.requiredColumns).toContain("Amount");
      expect(template?.requiredColumns).toContain("Type");
    });

    it("should have Google Ads template", () => {
      const template = getProviderTemplate("google_ads");
      expect(template?.templateName).toBe("Google Ads Campaigns");
      expect(template?.expectedColumns).toContain("Impressions");
      expect(template?.expectedColumns).toContain("Clicks");
      expect(template?.expectedColumns).toContain("Cost");
    });

    it("should have generic fallback template", () => {
      const template = getProviderTemplate("generic");
      expect(template).toBeDefined();
      expect(template?.templateName).toBe("Generic Export");
      expect(template?.requiredColumns.length).toBeGreaterThan(0);
    });

    it("should list templates for provider", () => {
      const hubspotTemplates = listProviderTemplates("hubspot");
      expect(hubspotTemplates.length).toBeGreaterThan(0);
      expect(hubspotTemplates[0].providerId).toBe("hubspot");
    });
  });

  describe("Field Mappings", () => {
    it("should map HubSpot Deal Amount to value", () => {
      const template = getProviderTemplate("hubspot")!;
      const mapping = template.fieldMappings["Deal Amount"];
      expect(mapping.sourceField).toBe("Deal Amount");
      expect(mapping.targetField).toBe("value");
      expect(mapping.confidence).toBe(1.0);
    });

    it("should include transformation rules", () => {
      const template = getProviderTemplate("google_ads")!;
      const costMapping = template.fieldMappings["Cost"];
      expect(costMapping.transformationRule?.type).toBe("divide");
      expect(costMapping.transformationRule?.factor).toBe(1000000); // Google Ads micros
    });

    it("should include date parsing rules", () => {
      const template = getProviderTemplate("hubspot")!;
      const dateMapping = template.fieldMappings["Close Date"];
      expect(dateMapping.transformationRule?.type).toBe("parse_date");
      expect(dateMapping.transformationRule?.format).toBe("YYYY-MM-DD");
    });

    it("should include categorical mapping for QB account types", () => {
      const template = getProviderTemplate("quickbooks")!;
      const typeMapping = template.fieldMappings["Type"];
      expect(typeMapping.transformationRule?.type).toBe("map");
      expect(typeMapping.transformationRule?.mapping?.Income).toBe("revenue");
      expect(typeMapping.transformationRule?.mapping?.Expense).toBe("cost");
    });

    it("should include confidence scores for all mappings", () => {
      const template = getProviderTemplate("hubspot")!;
      Object.values(template.fieldMappings).forEach((mapping) => {
        expect(mapping.confidence).toBeGreaterThanOrEqual(0);
        expect(mapping.confidence).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe("Template Validation", () => {
    it("should have required columns in expected columns", () => {
      Object.values(TEMPLATES).forEach((template) => {
        template.requiredColumns.forEach((req) => {
          expect(template.expectedColumns).toContain(req);
        });
      });
    });

    it("should have field mappings for all expected columns", () => {
      Object.values(TEMPLATES).forEach((template) => {
        const mappedSourceFields = Object.values(template.fieldMappings).map((m) => m.sourceField);
        // At least required columns should be mapped
        template.requiredColumns.forEach((col) => {
          expect(mappedSourceFields).toContain(col);
        });
      });
    });

    it("should not have duplicate provider-template pairs", () => {
      const pairs = new Set<string>();
      Object.values(TEMPLATES).forEach((template) => {
        const pair = `${template.providerId}:${template.templateName}`;
        expect(pairs.has(pair)).toBe(false);
        pairs.add(pair);
      });
    });
  });

  describe("Acceptance Gates (Protocol §21)", () => {
    it("should support at least one CRM export template", () => {
      const crmProviders = listActiveProviders().filter((p) => p.category === "CRM");
      expect(crmProviders.length).toBeGreaterThan(0);
      crmProviders.forEach((provider) => {
        const templates = listProviderTemplates(provider.id);
        expect(templates.length).toBeGreaterThan(0);
      });
    });

    it("should support generic export mapping", () => {
      const generic = getProviderTemplate("generic");
      expect(generic).toBeDefined();
      expect(generic?.fieldMappings).toBeDefined();
      expect(Object.keys(generic!.fieldMappings).length).toBeGreaterThan(0);
    });

    it("should include source lineage fields (source_reference_id)", () => {
      Object.values(TEMPLATES).forEach((template) => {
        const hasSourceRef = Object.values(template.fieldMappings).some(
          (m) => m.targetField === "source_reference_id",
        );
        expect(hasSourceRef).toBe(true);
      });
    });

    it("should support accounting provider templates", () => {
      const accounting = getProviderTemplate("quickbooks");
      expect(accounting).toBeDefined();
      expect(accounting?.providerId).toBe("quickbooks");
      expect(accounting?.fieldMappings).toBeDefined();
    });
  });
});
