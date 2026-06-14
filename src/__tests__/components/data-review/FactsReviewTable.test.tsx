/**
 * B05-S2 Fact Review Components — pure component unit tests.
 *
 * Tests UI components in isolation with mock data and handlers.
 * Verifies: rendering, action buttons, status displays, modals.
 * No DB, no API calls; components are pure and deterministic.
 *
 * Run: npm test -- src/__tests__/components/data-review/
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  FactsReviewTable,
  type FactRow,
  type FactsReviewTableProps,
} from "@/components/data-review/FactsReviewTable";
import { ReviewSummary, type ReviewSummaryProps } from "@/components/data-review/ReviewSummary";
import { AuditLogPanel, type AuditLogPanelProps } from "@/components/data-review/AuditLogPanel";

describe("B05-S2 Fact Review UI Components", () => {
  describe("FactsReviewTable", () => {
    it("renders facts with all columns (metric, value, source, confidence, status)", () => {
      const facts: FactRow[] = [
        {
          factId: "revenue_1",
          metric: "revenue",
          value: 100000,
          unit: "INR",
          sourceDocumentKind: "bank_api",
          confidenceScore: 0.95,
          validationStatus: "draft",
          sourceLocation: "Bank Statement 2026-05",
        },
      ];

      render(
        <FactsReviewTable
          facts={facts}
          reviewActions={[]}
          onApprove={vi.fn()}
          onEdit={vi.fn()}
          onReject={vi.fn()}
          onMarkUnknown={vi.fn()}
        />
      );

      expect(screen.getByText("revenue")).toBeInTheDocument();
      expect(screen.getByText("100000")).toBeInTheDocument();
      expect(screen.getByText("bank_api")).toBeInTheDocument();
      expect(screen.getByText("95%")).toBeInTheDocument();
    });

    it("renders action buttons for draft facts (approve, edit, reject, unknown)", () => {
      const facts: FactRow[] = [
        {
          factId: "fact_1",
          metric: "test",
          value: 42,
          unit: "units",
          sourceDocumentKind: "csv",
          confidenceScore: 0.5,
          validationStatus: "draft",
          sourceLocation: "test.csv",
        },
      ];

      render(
        <FactsReviewTable
          facts={facts}
          reviewActions={[]}
          onApprove={vi.fn()}
          onEdit={vi.fn()}
          onReject={vi.fn()}
          onMarkUnknown={vi.fn()}
        />
      );

      expect(screen.getByText(/✓ Approve/)).toBeInTheDocument();
      expect(screen.getByText(/Edit/)).toBeInTheDocument();
      expect(screen.getByText(/✗ Reject/)).toBeInTheDocument();
      expect(screen.getByText(/\? Unknown/)).toBeInTheDocument();
    });

    it("displays approved status when fact has been approved", () => {
      const facts: FactRow[] = [
        {
          factId: "fact_1",
          metric: "test",
          value: 42,
          unit: "units",
          sourceDocumentKind: "csv",
          confidenceScore: 0.5,
          validationStatus: "draft",
          sourceLocation: "test.csv",
        },
      ];

      const reviewActions = [
        {
          action: "approved" as const,
          factId: "fact_1",
        },
      ];

      render(
        <FactsReviewTable
          facts={facts}
          reviewActions={reviewActions}
          onApprove={vi.fn()}
          onEdit={vi.fn()}
          onReject={vi.fn()}
          onMarkUnknown={vi.fn()}
        />
      );

      expect(screen.getByText("approved")).toBeInTheDocument();
    });

    it("renders empty state when no facts provided", () => {
      render(
        <FactsReviewTable
          facts={[]}
          reviewActions={[]}
          onApprove={vi.fn()}
          onEdit={vi.fn()}
          onReject={vi.fn()}
          onMarkUnknown={vi.fn()}
        />
      );

      expect(screen.getByText("No facts to review")).toBeInTheDocument();
    });

    it("calls onApprove when approve button clicked", async () => {
      const onApprove = vi.fn();
      const facts: FactRow[] = [
        {
          factId: "fact_1",
          metric: "test",
          value: 42,
          unit: "units",
          sourceDocumentKind: "csv",
          confidenceScore: 0.5,
          validationStatus: "draft",
          sourceLocation: "test.csv",
        },
      ];

      render(
        <FactsReviewTable
          facts={facts}
          reviewActions={[]}
          onApprove={onApprove}
          onEdit={vi.fn()}
          onReject={vi.fn()}
          onMarkUnknown={vi.fn()}
        />
      );

      const approveButton = screen.getByText(/✓ Approve/);
      fireEvent.click(approveButton);

      expect(onApprove).toHaveBeenCalledWith("fact_1");
    });

    it("displays confidence as percentage bar", () => {
      const facts: FactRow[] = [
        {
          factId: "fact_1",
          metric: "test",
          value: 42,
          unit: "units",
          sourceDocumentKind: "csv",
          confidenceScore: 0.75,
          validationStatus: "draft",
          sourceLocation: "test.csv",
        },
      ];

      render(
        <FactsReviewTable
          facts={facts}
          reviewActions={[]}
          onApprove={vi.fn()}
          onEdit={vi.fn()}
          onReject={vi.fn()}
          onMarkUnknown={vi.fn()}
        />
      );

      expect(screen.getByText("75%")).toBeInTheDocument();
    });
  });

  describe("ReviewSummary", () => {
    it("renders summary counts for all review states", () => {
      const props: ReviewSummaryProps = {
        totalFacts: 10,
        approvedCount: 5,
        correctedCount: 2,
        rejectedCount: 1,
        markedUnknownCount: 1,
      };

      render(<ReviewSummary {...props} />);

      expect(screen.getByText("Total Facts")).toBeInTheDocument();
      expect(screen.getByText("Approved")).toBeInTheDocument();
      expect(screen.getByText("Corrected")).toBeInTheDocument();
      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });

    it("calculates and displays progress percentage", () => {
      const props: ReviewSummaryProps = {
        totalFacts: 10,
        approvedCount: 5,
        correctedCount: 3,
        rejectedCount: 1,
        markedUnknownCount: 1,
      };

      render(<ReviewSummary {...props} />);

      // 10 reviewed out of 10 = 100%
      expect(screen.getByText("10 of 10 (100%)")).toBeInTheDocument();
    });

    it("shows pending count when review is incomplete", () => {
      const props: ReviewSummaryProps = {
        totalFacts: 10,
        approvedCount: 5,
        correctedCount: 2,
        rejectedCount: 0,
        markedUnknownCount: 0,
      };

      const { container } = render(<ReviewSummary {...props} />);

      // 7 reviewed, 3 pending — check for text containing pending
      expect(container.textContent).toContain("pending review");
    });

    it("shows completion message when all facts reviewed", () => {
      const props: ReviewSummaryProps = {
        totalFacts: 10,
        approvedCount: 5,
        correctedCount: 3,
        rejectedCount: 1,
        markedUnknownCount: 1,
      };

      render(<ReviewSummary {...props} />);

      expect(screen.getByText("✓ All facts reviewed")).toBeInTheDocument();
    });
  });

  describe("AuditLogPanel", () => {
    it("renders audit log with correction history", () => {
      const actions = [
        {
          action: "corrected" as const,
          factId: "fact_1",
          previousValue: 100000,
          newValue: 120000,
          correctionReason: "Owner verified",
        },
        {
          action: "approved" as const,
          factId: "fact_2",
        },
      ];

      render(<AuditLogPanel actions={actions} />);

      expect(screen.getByText(/corrected/)).toBeInTheDocument();
      expect(screen.getByText(/approved/)).toBeInTheDocument();
      expect(screen.getByText("fact_1")).toBeInTheDocument();
      expect(screen.getByText("fact_2")).toBeInTheDocument();
    });

    it("displays previous and new values for corrections", () => {
      const actions = [
        {
          action: "corrected" as const,
          factId: "fact_1",
          previousValue: 100,
          newValue: 200,
          correctionReason: "Typo fix",
        },
      ];

      render(<AuditLogPanel actions={actions} />);

      expect(screen.getByText(/Previous:/)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
      expect(screen.getByText(/New:/)).toBeInTheDocument();
      expect(screen.getByText(/200/)).toBeInTheDocument();
    });

    it("shows empty state when no actions", () => {
      render(<AuditLogPanel actions={[]} />);

      expect(screen.getByText("No corrections yet")).toBeInTheDocument();
    });

    it("displays correction reason when provided", () => {
      const actions = [
        {
          action: "rejected" as const,
          factId: "fact_1",
          correctionReason: "Source unreliable",
        },
      ];

      render(<AuditLogPanel actions={actions} />);

      expect(screen.getByText(/Source unreliable/)).toBeInTheDocument();
    });

    it("shows loading state", () => {
      render(<AuditLogPanel actions={[]} loading={true} />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });
});
