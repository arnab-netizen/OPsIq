import { describe, it, expect } from "vitest";
import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";

describe("humanizeMetricKey", () => {
  it("converts camelCase metric keys to lowercase words", () => {
    expect(humanizeMetricKey("dataConfidenceScore")).toBe("data confidence score");
    expect(humanizeMetricKey("netMarginPct")).toBe("net margin %");
    expect(humanizeMetricKey("cashRunwayDays")).toBe("cash runway days");
    expect(humanizeMetricKey("receivablesPressurePct")).toBe("receivables pressure %");
  });

  it("returns falsy/empty input unchanged", () => {
    expect(humanizeMetricKey("")).toBe("");
  });
});

describe("humanizeEvidenceLine", () => {
  it("humanizes a leading camelCase token in an evidence string", () => {
    expect(humanizeEvidenceLine("dataConfidenceScore = 70 < 100")).toBe("data confidence score = 70 < 100");
  });

  it("humanizes a mid-sentence camelCase token", () => {
    expect(humanizeEvidenceLine("Re-measure dataConfidenceScore next snapshot; target higher.")).toBe(
      "Re-measure data confidence score next snapshot; target higher."
    );
  });

  it("leaves ordinary English text with no camelCase token unchanged", () => {
    expect(humanizeEvidenceLine("missing critical inputs: Revenue, Costs")).toBe(
      "missing critical inputs: Revenue, Costs"
    );
    expect(humanizeEvidenceLine("Compare next-period revenue against breakEvenRevenue.")).toBe(
      "Compare next-period revenue against break even revenue."
    );
  });
});
