/**
 * Research provider boundary — defines the contract for all external data acquisition.
 * Concrete implementations: StaticStubProvider (CI/test), HttpFetchProvider (production).
 * No business logic here; this is pure I/O boundary.
 */

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
      retrievedAt: new Date("2026-01-01T00:00:00Z"),
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

  canHandle(_domain: string): boolean {
    return true; // Stub handles all domains — returns REQUIRES_OWNER for unknowns
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

/** Registry — returns the appropriate provider for a domain in the current environment. */
export function getResearchProvider(): ResearchProvider {
  // Production: could switch on env to return an HttpFetchProvider.
  // For now the stub is the only concrete implementation.
  return new StaticStubProvider();
}
