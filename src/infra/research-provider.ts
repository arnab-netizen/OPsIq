/**
 * Research provider boundary — defines the contract for all external data acquisition.
 * Concrete implementations: StaticStubProvider (CI/test), SafePublicHttpFetchProvider (production).
 * No business logic here; this is pure I/O boundary.
 */

export type ProviderCapability =
  | "WEB_SEARCH"
  | "PUBLIC_WEB_FETCH"
  | "OFFICIAL_SOURCE_FETCH"
  | "GOVERNMENT_PORTAL_LOOKUP"
  | "MARKETPLACE_OBSERVATION"
  | "CONNECTED_INTERNAL_DATA"
  | "DOCUMENT_EXTRACTION";

export type ProviderType = "STATIC_STUB" | "SAFE_HTTP_FETCH" | "CONNECTED_INTERNAL";

export type AcquisitionStatus =
  | "ACQUIRED"
  | "FAILED_TIMEOUT"
  | "FAILED_NOT_FOUND"
  | "FAILED_AUTH_REQUIRED"
  | "FAILED_RATE_LIMITED"
  | "FAILED_PARSE_ERROR"
  | "REQUIRES_OWNER"
  | "SKIPPED_POLICY"
  | "PENDING";

export interface ResearchRequest {
  domain: string;
  query: string;
  geography?: string;
  maxAgeHours?: number;
  maxResponseBytes?: number;
}

export interface ResearchResult {
  domain: string;
  status: AcquisitionStatus;
  sourceUrl?: string;
  sourceType: string;
  rawResult?: string;
  extractedFacts: Record<string, unknown>[];
  reliabilityClassification: string;
  confidence: number;
  limitations?: string;
  retrievedAt?: Date;
  geography?: string;
}

export interface ResearchProvider {
  readonly providerType: string;
  canHandle(domain: string): boolean;
  acquire(request: ResearchRequest): Promise<ResearchResult>;
  search(query: string): Promise<{ title: string; url: string; snippet: string }[]>;
  fetch(url: string): Promise<{ body: string; contentType: string; retrievedAt: Date }>;
  healthCheck(): Promise<boolean>;
  capabilities(): ProviderCapability[];
}

/**
 * Deterministic stub provider for unit tests and CI.
 * Returns static fixtures per domain with no network calls.
 */
export class StaticStubProvider implements ResearchProvider {
  readonly providerType = "STATIC_STUB";

  private static readonly FIXTURES: Record<string, Omit<ResearchResult, "domain">> = {
    pricing_benchmarks: {
      status: "ACQUIRED",
      sourceType: "STUB_FIXTURE",
      rawResult: "Competitor price range: $50–$150/unit (stub)",
      extractedFacts: [{ metric: "competitor_price_range", low: 50, high: 150, currency: "AUD", unit: "per_unit" }],
      reliabilityClassification: "INFERRED",
      confidence: 40,
      limitations: "Stub fixture — replace with live data in production",
      retrievedAt: undefined, // resolved to new Date() at acquire time — not a fixed stub date
    },
    market_size: {
      status: "REQUIRES_OWNER",
      sourceType: "STUB_FIXTURE",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: "Cannot auto-acquire market size — owner must provide industry data",
    },
    regulatory_requirements: {
      status: "REQUIRES_OWNER",
      sourceType: "STUB_FIXTURE",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: "Regulatory data requires owner-verified authoritative source",
    },
    customer_demand: {
      status: "REQUIRES_OWNER",
      sourceType: "STUB_FIXTURE",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: "Customer demand requires direct field interviews by owner",
    },
    supplier_availability: {
      status: "REQUIRES_OWNER",
      sourceType: "STUB_FIXTURE",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: "Supplier quotes require owner outreach",
    },
    delivery_cost_structure: {
      status: "REQUIRES_OWNER",
      sourceType: "STUB_FIXTURE",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: "Cost structure requires owner cost modelling with real supplier data",
    },
  };

  capabilities(): ProviderCapability[] {
    return [];
  }

  canHandle(_domain: string): boolean {
    return true; // Stub handles all domains — returns REQUIRES_OWNER for unknowns
  }

  async search(_query: string): Promise<{ title: string; url: string; snippet: string }[]> {
    return [];
  }

  async fetch(_url: string): Promise<{ body: string; contentType: string; retrievedAt: Date }> {
    return { body: "", contentType: "text/plain", retrievedAt: new Date() };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async acquire(request: ResearchRequest): Promise<ResearchResult> {
    const fixture = StaticStubProvider.FIXTURES[request.domain];
    if (fixture) {
      return { domain: request.domain, ...fixture, retrievedAt: fixture.retrievedAt ?? new Date() };
    }
    return {
      domain: request.domain,
      status: "REQUIRES_OWNER",
      sourceType: "STUB_FIXTURE",
      extractedFacts: [],
      reliabilityClassification: "UNVERIFIED",
      confidence: 0,
      limitations: `Unknown domain "${request.domain}" — owner must supply evidence`,
      retrievedAt: new Date(),
    };
  }
}

/**
 * Registry — returns the appropriate provider for the current environment.
 * Fail-closed: unrecognised environments throw a configuration error rather than
 * silently returning the CI stub, which would hide misconfiguration in production.
 *
 * Recognised modes:
 *   NODE_ENV=test | RESEARCH_PROVIDER=stub  → StaticStubProvider (no network)
 *   NODE_ENV=production | RESEARCH_PROVIDER=http → SafePublicHttpFetchProvider
 *   NODE_ENV=development + RESEARCH_PROVIDER=stub → StaticStubProvider (explicit opt-in)
 */
export function getResearchProvider(): ResearchProvider {
  const override = process.env.RESEARCH_PROVIDER;
  const env = process.env.NODE_ENV;

  if (override === "stub" || env === "test") {
    return new StaticStubProvider();
  }
  if (override === "http" || env === "production") {
    // Lazy import to avoid pulling fetch-provider into test bundles
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SafePublicHttpFetchProvider } = require("./safe-http-fetch-provider") as typeof import("./safe-http-fetch-provider");
    return new SafePublicHttpFetchProvider();
  }
  if (env === "development") {
    // Development requires an explicit RESEARCH_PROVIDER=stub or RESEARCH_PROVIDER=http
    throw new Error(
      `RESEARCH_PROVIDER_CONFIG_ERROR: NODE_ENV=development requires explicit RESEARCH_PROVIDER env var (stub|http). ` +
      `Set RESEARCH_PROVIDER=stub to use CI fixtures or RESEARCH_PROVIDER=http to enable live fetching.`
    );
  }
  // Unknown environments (staging, preview, etc.) must configure RESEARCH_PROVIDER explicitly.
  throw new Error(
    `RESEARCH_PROVIDER_CONFIG_ERROR: unrecognised environment "${env ?? "(unset)"}". ` +
    `Set RESEARCH_PROVIDER=stub or RESEARCH_PROVIDER=http explicitly.`
  );
}
