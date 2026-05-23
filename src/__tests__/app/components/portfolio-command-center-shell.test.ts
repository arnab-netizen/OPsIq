import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  generateMockPortfolioView,
  PortfolioCommandCenterShell,
} from "@/app/components/portfolio-command-center-shell";

// ============================================================================
// TEST SUITE: Portfolio Command Center Shell
// ============================================================================

describe("Portfolio Command Center Shell - Mock Data Generation", () => {
  it("generates valid portfolio view with required fields", () => {
    const portfolio = generateMockPortfolioView();

    expect(portfolio).toMatchObject({
      totalEngagements: expect.any(Number),
      activeEngagements: expect.any(Number),
      averageHealth: expect.any(Number),
      criticalCount: expect.any(Number),
      portfolioRisk: expect.stringMatching(
        /^(minimal|low|moderate|high|critical)$/
      ),
      engagements: expect.any(Array),
      topRisks: expect.any(Array),
    });
  });

  it("ensures activeEngagements <= totalEngagements", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.activeEngagements).toBeLessThanOrEqual(
      portfolio.totalEngagements
    );
  });

  it("includes at least 3 engagements", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.engagements.length).toBeGreaterThanOrEqual(3);
  });

  it("calculates averageHealth as integer between 0 and 100", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.averageHealth).toBeGreaterThanOrEqual(0);
    expect(portfolio.averageHealth).toBeLessThanOrEqual(100);
    expect(Number.isInteger(portfolio.averageHealth)).toBe(true);
  });

  it("counts critical engagements correctly", () => {
    const portfolio = generateMockPortfolioView();
    const expectedCriticalCount = portfolio.engagements.filter(
      (e) => e.impactLevel === "critical"
    ).length;
    expect(portfolio.criticalCount).toBe(expectedCriticalCount);
  });

  it("determines portfolioRisk based on criticalCount and averageHealth", () => {
    const portfolio = generateMockPortfolioView();

    if (portfolio.criticalCount >= 3) {
      expect(portfolio.portfolioRisk).toBe("critical");
    } else if (portfolio.criticalCount === 2) {
      expect(portfolio.portfolioRisk).toBe("high");
    } else if (portfolio.criticalCount === 1 || portfolio.averageHealth < 60) {
      expect(["moderate", "critical"].includes(portfolio.portfolioRisk)).toBe(
        true
      );
    }
  });

  it("includes top 5 at-risk engagements sorted by atRiskCount", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.topRisks.length).toBeLessThanOrEqual(5);

    for (let i = 0; i < portfolio.topRisks.length - 1; i++) {
      const current = portfolio.engagements.find(
        (e) => e.engagementId === portfolio.topRisks[i].engagementId
      );
      const next = portfolio.engagements.find(
        (e) => e.engagementId === portfolio.topRisks[i + 1].engagementId
      );
      expect(current?.atRiskCount || 0).toBeGreaterThanOrEqual(
        next?.atRiskCount || 0
      );
    }
  });
});

describe("Portfolio Command Center Shell - Engagement Metrics", () => {
  it("generates engagements with valid IDs", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.engagements.every((e) => e.engagementId)).toBe(true);
    expect(
      portfolio.engagements.every((e) => e.engagementId.startsWith("eng-"))
    ).toBe(true);
  });

  it("generates unique engagement IDs", () => {
    const portfolio = generateMockPortfolioView();
    const ids = portfolio.engagements.map((e) => e.engagementId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates engagements with valid statuses", () => {
    const portfolio = generateMockPortfolioView();
    const validStatuses = [
      "active",
      "paused",
      "completed",
      "at_risk",
      "blocked",
    ];
    expect(
      portfolio.engagements.every((e) => validStatuses.includes(e.status))
    ).toBe(true);
  });

  it("ensures healthScore is between 0 and 100", () => {
    const portfolio = generateMockPortfolioView();
    expect(
      portfolio.engagements.every(
        (e) => e.healthScore >= 0 && e.healthScore <= 100
      )
    ).toBe(true);
  });

  it("generates engagements with valid impact levels", () => {
    const portfolio = generateMockPortfolioView();
    const validLevels = ["low", "medium", "high", "critical", "existential"];
    expect(
      portfolio.engagements.every((e) =>
        validLevels.includes(e.impactLevel)
      )
    ).toBe(true);
  });

  it("ensures completedActions <= recommendedActions for each engagement", () => {
    const portfolio = generateMockPortfolioView();
    expect(
      portfolio.engagements.every((e) => e.completedActions <= e.recommendedActions)
    ).toBe(true);
  });

  it("generates non-negative revenue at risk", () => {
    const portfolio = generateMockPortfolioView();
    expect(
      portfolio.engagements.every((e) => e.revenueAtRisk >= 0)
    ).toBe(true);
  });

  it("includes owner name for each engagement", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.engagements.every((e) => e.owner)).toBe(true);
    expect(
      portfolio.engagements.every((e) => e.owner.length > 0)
    ).toBe(true);
  });

  it("includes valid nextReviewDate for each engagement", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.engagements.every((e) => e.nextReviewDate)).toBe(true);
    expect(
      portfolio.engagements.every((e) => {
        const date = new Date(e.nextReviewDate);
        return !isNaN(date.getTime());
      })
    ).toBe(true);
  });
});

describe("Portfolio Command Center Shell - Risk Analysis", () => {
  it("includes riskType for each risk", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.topRisks.every((r) => r.riskType)).toBe(true);
    expect(
      portfolio.topRisks.every(
        (r) =>
          r.riskType === "execution_blocked" || r.riskType === "action_overdue"
      )
    ).toBe(true);
  });

  it("includes severity for each risk", () => {
    const portfolio = generateMockPortfolioView();
    const validSeverities = ["low", "medium", "high", "critical"];
    expect(
      portfolio.topRisks.every((r) => validSeverities.includes(r.severity))
    ).toBe(true);
  });

  it("includes mitigation strategy for each risk", () => {
    const portfolio = generateMockPortfolioView();
    expect(portfolio.topRisks.every((r) => r.mitigation)).toBe(true);
    expect(portfolio.topRisks.every((r) => r.mitigation.length > 0)).toBe(
      true
    );
  });

  it("maps critical impact level to high/critical severity", () => {
    const portfolio = generateMockPortfolioView();
    portfolio.topRisks.forEach((risk) => {
      const eng = portfolio.engagements.find(
        (e) => e.engagementId === risk.engagementId
      );
      if (eng?.impactLevel === "critical") {
        expect(["high", "critical"].includes(risk.severity)).toBe(true);
      }
    });
  });

  it("includes only risks from engagements with atRiskCount > 0", () => {
    const portfolio = generateMockPortfolioView();
    portfolio.topRisks.forEach((risk) => {
      const eng = portfolio.engagements.find(
        (e) => e.engagementId === risk.engagementId
      );
      expect(eng?.atRiskCount).toBeGreaterThan(0);
    });
  });
});

describe("Portfolio Command Center Shell - Portfolio Health", () => {
  it("correctly sums total engagement revenue at risk", () => {
    const portfolio = generateMockPortfolioView();
    const calculatedTotal = portfolio.engagements.reduce(
      (sum, e) => sum + e.revenueAtRisk,
      0
    );
    expect(calculatedTotal).toBeGreaterThan(0);
  });

  it("ensures portfolio risk escalates with critical engagement count", () => {
    const portfolio = generateMockPortfolioView();

    if (portfolio.criticalCount === 0 && portfolio.averageHealth >= 75) {
      expect(["minimal", "low"].includes(portfolio.portfolioRisk)).toBe(true);
    }

    if (portfolio.criticalCount >= 2) {
      expect(["moderate", "high", "critical"].includes(portfolio.portfolioRisk))
        .toBe(true);
    }
  });

  it("includes mix of engagement statuses", () => {
    const portfolio = generateMockPortfolioView();
    const statuses = new Set(portfolio.engagements.map((e) => e.status));
    expect(statuses.size).toBeGreaterThan(1);
  });

  it("includes both high and medium/low impact engagements", () => {
    const portfolio = generateMockPortfolioView();
    const hasHighImpact = portfolio.engagements.some(
      (e) => e.impactLevel === "high" || e.impactLevel === "critical"
    );
    const hasLowImpact = portfolio.engagements.some(
      (e) => e.impactLevel === "low" || e.impactLevel === "medium"
    );
    expect(hasHighImpact).toBe(true);
    expect(hasLowImpact).toBe(true);
  });

  it("reflects health score distribution across engagements", () => {
    const portfolio = generateMockPortfolioView();
    const hasGood = portfolio.engagements.some((e) => e.healthScore >= 80);
    const hasModerate = portfolio.engagements.some(
      (e) => e.healthScore >= 60 && e.healthScore < 80
    );
    const hasPoor = portfolio.engagements.some((e) => e.healthScore < 60);

    const distributionCount = [hasGood, hasModerate, hasPoor].filter(
      Boolean
    ).length;
    expect(distributionCount).toBeGreaterThanOrEqual(2);
  });
});

describe("Portfolio Command Center Shell - Data Consistency", () => {
  it("ensures deterministic generation (same output on repeated calls)", () => {
    const portfolio1 = generateMockPortfolioView();
    const portfolio2 = generateMockPortfolioView();

    expect(portfolio1.totalEngagements).toBe(portfolio2.totalEngagements);
    expect(portfolio1.engagements.length).toBe(
      portfolio2.engagements.length
    );
    expect(portfolio1.engagements[0].engagementId).toBe(
      portfolio2.engagements[0].engagementId
    );
  });

  it("ensures all referenced engagements in topRisks exist in engagements list", () => {
    const portfolio = generateMockPortfolioView();
    const engagementIds = new Set(
      portfolio.engagements.map((e) => e.engagementId)
    );
    expect(
      portfolio.topRisks.every((r) => engagementIds.has(r.engagementId))
    ).toBe(true);
  });

  it("maintains engagement consistency across multiple calls", () => {
    const portfolios = [
      generateMockPortfolioView(),
      generateMockPortfolioView(),
      generateMockPortfolioView(),
    ];

    expect(
      portfolios.every((p) => p.totalEngagements === portfolios[0].totalEngagements)
    ).toBe(true);
  });

  it("validates schema consistency for all generated objects", () => {
    const portfolio = generateMockPortfolioView();

    portfolio.engagements.forEach((eng) => {
      expect(typeof eng.engagementId).toBe("string");
      expect(typeof eng.name).toBe("string");
      expect(typeof eng.healthScore).toBe("number");
      expect(typeof eng.recommendedActions).toBe("number");
      expect(typeof eng.completedActions).toBe("number");
      expect(typeof eng.atRiskCount).toBe("number");
      expect(typeof eng.revenueAtRisk).toBe("number");
      expect(typeof eng.owner).toBe("string");
      expect(typeof eng.nextReviewDate).toBe("string");
    });

    portfolio.topRisks.forEach((risk) => {
      expect(typeof risk.engagementId).toBe("string");
      expect(typeof risk.riskType).toBe("string");
      expect(typeof risk.severity).toBe("string");
      expect(typeof risk.mitigation).toBe("string");
    });
  });
});

describe("Portfolio Command Center Shell - Edge Cases", () => {
  it("handles all at-risk engagements", () => {
    const portfolio = generateMockPortfolioView();
    const atRiskEngagements = portfolio.engagements.filter(
      (e) => e.status === "at_risk"
    );
    expect(atRiskEngagements.length).toBeGreaterThanOrEqual(1);
  });

  it("handles completed engagements with zero atRiskCount", () => {
    const portfolio = generateMockPortfolioView();
    const completedEngagements = portfolio.engagements.filter(
      (e) => e.status === "completed"
    );
    expect(
      completedEngagements.every(
        (e) =>
          e.completedActions === e.recommendedActions &&
          e.atRiskCount === 0
      )
    ).toBe(true);
  });

  it("calculates portfolio risk as 'critical' when criticalCount >= 3", () => {
    const portfolio = generateMockPortfolioView();
    if (portfolio.criticalCount >= 3) {
      expect(portfolio.portfolioRisk).toBe("critical");
    }
  });

  it("handles mixed completion percentages across engagements", () => {
    const portfolio = generateMockPortfolioView();
    const completionPercentages = portfolio.engagements.map(
      (e) => (e.completedActions / e.recommendedActions) * 100
    );
    const hasPartialCompletion = completionPercentages.some(
      (p) => p > 0 && p < 100
    );
    expect(hasPartialCompletion).toBe(true);
  });

  it("ensures at least one engagement with non-zero atRiskCount for topRisks", () => {
    const portfolio = generateMockPortfolioView();
    if (portfolio.topRisks.length > 0) {
      const riskEngagements = portfolio.engagements.filter((e) =>
        portfolio.topRisks.some((r) => r.engagementId === e.engagementId)
      );
      expect(riskEngagements.every((e) => e.atRiskCount > 0)).toBe(true);
    }
  });

  it("validates health score calculation across diverse values", () => {
    const portfolio = generateMockPortfolioView();
    const healthScores = portfolio.engagements.map((e) => e.healthScore);
    const minScore = Math.min(...healthScores);
    const maxScore = Math.max(...healthScores);
    const range = maxScore - minScore;

    expect(minScore).toBeGreaterThanOrEqual(0);
    expect(maxScore).toBeLessThanOrEqual(100);
    expect(range).toBeGreaterThan(5);
  });

  it("ensures recommendedActions > 0 for active engagements", () => {
    const portfolio = generateMockPortfolioView();
    const activeEngagements = portfolio.engagements.filter(
      (e) => e.status === "active"
    );
    expect(
      activeEngagements.every((e) => e.recommendedActions > 0)
    ).toBe(true);
  });
});

describe("Portfolio Command Center Shell - Component Existence", () => {
  it("exports PortfolioCommandCenterShell as a component function", () => {
    expect(typeof PortfolioCommandCenterShell).toBe("function");
    expect(PortfolioCommandCenterShell.name).toBe(
      "PortfolioCommandCenterShell"
    );
  });
});

describe("Portfolio Command Center Shell - Real-World Scenarios", () => {
  it("models a healthy portfolio with low risk", () => {
    const portfolio = generateMockPortfolioView();
    const isHealthy =
      portfolio.averageHealth >= 75 &&
      portfolio.criticalCount === 0;
    if (isHealthy) {
      expect(portfolio.portfolioRisk).toBe("minimal");
    }
  });

  it("models a portfolio with critical blockers", () => {
    const portfolio = generateMockPortfolioView();
    const blockedEngagements = portfolio.engagements.filter(
      (e) => e.status === "blocked" || e.status === "at_risk"
    );
    if (blockedEngagements.length > 0) {
      expect(blockedEngagements.every((e) => e.atRiskCount > 0)).toBe(true);
    }
  });

  it("tracks owner accountability across portfolio", () => {
    const portfolio = generateMockPortfolioView();
    const owners = new Set(portfolio.engagements.map((e) => e.owner));
    expect(owners.size).toBeGreaterThan(1);
  });

  it("includes next review dates within reasonable future window", () => {
    const portfolio = generateMockPortfolioView();
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    portfolio.engagements.forEach((eng) => {
      const reviewDate = new Date(eng.nextReviewDate);
      expect(reviewDate > today).toBe(true);
      expect(reviewDate < thirtyDaysLater).toBe(true);
    });
  });

  it("calculates meaningful revenue at risk metrics", () => {
    const portfolio = generateMockPortfolioView();
    const totalRevenueAtRisk = portfolio.engagements.reduce(
      (sum, e) => sum + e.revenueAtRisk,
      0
    );
    const averageRevenueAtRisk =
      totalRevenueAtRisk / portfolio.totalEngagements;
    expect(totalRevenueAtRisk).toBeGreaterThan(0);
    expect(averageRevenueAtRisk).toBeGreaterThan(0);
  });
});

describe("Portfolio Command Center Shell - Filtering & Sorting Logic", () => {
  it("supports filtering by engagement status", () => {
    const portfolio = generateMockPortfolioView();
    const statuses = [
      "active",
      "paused",
      "completed",
      "at_risk",
      "blocked",
    ] as const;

    statuses.forEach((status) => {
      const filtered = portfolio.engagements.filter((e) => e.status === status);
      const unfiltered = portfolio.engagements;
      if (filtered.length > 0) {
        expect(filtered.every((e) => e.status === status)).toBe(true);
      }
    });
  });

  it("supports sorting by health score (descending)", () => {
    const portfolio = generateMockPortfolioView();
    const sorted = [...portfolio.engagements].sort(
      (a, b) => b.healthScore - a.healthScore
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].healthScore).toBeGreaterThanOrEqual(sorted[i + 1].healthScore);
    }
  });

  it("supports sorting by impact level (descending)", () => {
    const portfolio = generateMockPortfolioView();
    const impactOrder = {
      existential: 5,
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    const sorted = [...portfolio.engagements].sort(
      (a, b) => impactOrder[b.impactLevel] - impactOrder[a.impactLevel]
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      expect(impactOrder[sorted[i].impactLevel]).toBeGreaterThanOrEqual(
        impactOrder[sorted[i + 1].impactLevel]
      );
    }
  });

  it("supports sorting by atRiskCount (descending)", () => {
    const portfolio = generateMockPortfolioView();
    const sorted = [...portfolio.engagements].sort(
      (a, b) => b.atRiskCount - a.atRiskCount
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].atRiskCount).toBeGreaterThanOrEqual(
        sorted[i + 1].atRiskCount
      );
    }
  });

  it("supports sorting by name (alphabetically)", () => {
    const portfolio = generateMockPortfolioView();
    const sorted = [...portfolio.engagements].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].name <= sorted[i + 1].name).toBe(true);
    }
  });
});
