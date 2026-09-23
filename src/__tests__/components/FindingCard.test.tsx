/**
 * FindingCard — own-property-only label/variant lookups (shared-component prototype-pollution
 * hardening).
 *
 * Root cause fixed here: `FINDING_TYPE_LABEL`/`SEVERITY_LABEL`/`SEVERITY_VARIANT` were plain
 * object-literal lookups (`map[key]`) with no `hasOwnProperty` guard. Every plain JS object
 * inherits `Object.prototype` members, so a `findingType`/`severity` value equal to
 * `"constructor"`, `"toString"`, `"hasOwnProperty"`, or `"valueOf"` resolved to that inherited
 * *function* instead of `undefined` (React logs "Functions are not valid as a React child" and
 * renders nothing for that badge), and `"__proto__"` resolved to the prototype *object* itself
 * (React throws synchronously: "Objects are not valid as a React child"). This file proves the
 * `ownLookup()` fix added directly in FindingCard.tsx makes all five poison values fall through
 * to the exact same raw-value fallback an ordinary unrecognized string already used — no crash,
 * no console error, no blank badge — while leaving every canonical label, every case
 * normalization, every color/variant mapping, and the unknown/missing-value fallback text
 * completely unchanged from before the fix.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { FindingCard, type FindingCardData } from "@/components/owner/FindingCard";

function baseFinding(overrides: Partial<FindingCardData> = {}): FindingCardData {
  return {
    id: "finding-1",
    findingType: "risk",
    title: "Customers are churning fast",
    summary: "A large share of the customer base is being lost.",
    sourceMetric: "lostCustomerRatePercent",
    sourceValue: 57.1,
    threshold: 35,
    severity: "critical",
    confidence: 0.8,
    evidence: ["lost customer rate % = 57.1 > 35"],
    verificationMetric: "lostCustomerRatePercent",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("FindingCard — canonical values (unchanged)", () => {
  it.each([
    ["opportunity", "Opportunity"],
    ["risk", "Risk"],
  ])("findingType=%s renders label %s", (findingType, label) => {
    render(<FindingCard finding={baseFinding({ findingType })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ["low", "Low"],
    ["medium", "Medium"],
    ["high", "High"],
    ["critical", "Critical"],
  ])("severity=%s renders label %s", (severity, label) => {
    render(<FindingCard finding={baseFinding({ severity })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("severity variant classes are unchanged for each canonical severity", () => {
    const expectedFragment: Record<string, string> = {
      low: "text-[var(--muted-foreground-accessible)]",
      medium: "text-primary",
      high: "text-warning",
      critical: "text-destructive",
    };
    for (const [severity, fragment] of Object.entries(expectedFragment)) {
      render(<FindingCard finding={baseFinding({ severity })} />);
      const badge = screen.getByText(
        severity[0].toUpperCase() + severity.slice(1)
      );
      expect(badge.className).toContain(fragment);
      cleanup();
    }
  });
});

describe("FindingCard — case normalization (unchanged)", () => {
  it("mixed-case findingType normalizes to the canonical label", () => {
    render(<FindingCard finding={baseFinding({ findingType: "Risk" })} />);
    expect(screen.getByText("Risk")).toBeInTheDocument();
  });

  it("all-caps severity normalizes to the canonical label", () => {
    render(<FindingCard finding={baseFinding({ severity: "CRITICAL" })} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});

describe("FindingCard — unknown and missing values (unchanged fallback)", () => {
  it("an unrecognized findingType string renders the raw value verbatim", () => {
    render(<FindingCard finding={baseFinding({ findingType: "anomaly" })} />);
    expect(screen.getByText("anomaly")).toBeInTheDocument();
  });

  it("an unrecognized severity string renders the raw value verbatim with the default variant", () => {
    render(<FindingCard finding={baseFinding({ severity: "urgent" })} />);
    const badge = screen.getByText("urgent");
    expect(badge.className).toContain("text-primary");
    expect(badge.className).not.toContain("undefined");
  });

  it("missing (undefined) findingType/severity renders without crashing", () => {
    expect(() =>
      render(
        <FindingCard
          finding={baseFinding({ findingType: undefined as unknown as string, severity: undefined as unknown as string })}
        />
      )
    ).not.toThrow();
    expect(screen.getByText("What OpsIQ found")).toBeInTheDocument();
  });

  it("missing (null) findingType/severity renders without crashing", () => {
    expect(() =>
      render(
        <FindingCard
          finding={baseFinding({ findingType: null as unknown as string, severity: null as unknown as string })}
        />
      )
    ).not.toThrow();
    expect(screen.getByText("What OpsIQ found")).toBeInTheDocument();
  });
});

describe("FindingCard — inherited Object.prototype property names never resolve as map entries", () => {
  const POISON_VALUES = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

  describe("findingType poisoned (severity held canonical)", () => {
    it.each(POISON_VALUES)('findingType="%s" renders the raw value, no crash, no console error', (poison) => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let container: HTMLElement | undefined;
      expect(() => {
        const r = render(<FindingCard finding={baseFinding({ findingType: poison })} />);
        container = r.container;
      }).not.toThrow();

      // Rendered as plain visible text, never as a function/object -- proves the lookup fell
      // through to the same raw-value fallback an ordinary unknown string already used.
      expect(container!.textContent).toContain(poison);
      // The severity badge (held canonical) is unaffected by the findingType poisoning.
      expect(screen.getByText("Critical")).toBeInTheDocument();
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe("severity poisoned (findingType held canonical)", () => {
    it.each(POISON_VALUES)('severity="%s" renders the raw value with the default variant, no crash, no console error', (poison) => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let container: HTMLElement | undefined;
      expect(() => {
        const r = render(<FindingCard finding={baseFinding({ severity: poison })} />);
        container = r.container;
      }).not.toThrow();

      expect(container!.textContent).toContain(poison);
      // The findingType badge (held canonical) is unaffected by the severity poisoning.
      expect(screen.getByText("Risk")).toBeInTheDocument();

      const severityBadge = screen.getByText(poison);
      // Falls back to the same "default" variant every other unrecognized severity string uses --
      // never an invalid/undefined Badge variant class.
      expect(severityBadge.className).toContain("text-primary");
      expect(severityBadge.className).not.toContain("undefined");

      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});

describe("FindingCard — every previously-shown field is preserved", () => {
  it("renders title, summary, metric/value/threshold, confidence, evidence, and verification metric", () => {
    render(<FindingCard finding={baseFinding()} />);

    expect(screen.getByText("Customers are churning fast")).toBeInTheDocument();
    expect(screen.getByText("A large share of the customer base is being lost.")).toBeInTheDocument();
    expect(screen.getByText(/Measured:/)).toBeInTheDocument();
    expect(screen.getByText(/compared against/i)).toBeInTheDocument();
    expect(screen.getByText(/Supporting detail:/)).toBeInTheDocument();
    expect(screen.getByText(/lost customer rate % = 57\.1 > 35/i)).toBeInTheDocument();
    expect(screen.getByText(/How sure OpsIQ is:/)).toBeInTheDocument();
    expect(screen.getByText(/80% confidence/)).toBeInTheDocument();
    expect(screen.getByText(/verify by re-checking/i)).toBeInTheDocument();
  });

  it("a finding with no evidence and no verification metric omits those lines without crashing", () => {
    render(<FindingCard finding={baseFinding({ evidence: [], verificationMetric: null })} />);
    expect(screen.getByText("Customers are churning fast")).toBeInTheDocument();
    expect(screen.queryByText(/Supporting detail:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/verify by re-checking/i)).not.toBeInTheDocument();
  });
});
