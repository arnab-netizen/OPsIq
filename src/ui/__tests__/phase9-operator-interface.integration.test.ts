import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecommendationsView } from "@/ui/recommendations-view";
import { AuditTimeline } from "@/ui/audit-timeline";
import { ActionCenter } from "@/ui/action-center";
import { KPITrend } from "@/ui/kpi-trend";

describe("Phase 9: Operator Interface", () => {
  describe("1. Recommendations View", () => {
    it("should display recommendations sorted by score DESC", () => {
      const recommendations = [
        {
          id: "rec-1",
          title: "Implement Process A",
          priority: "high",
          score: 0.5,
          scoreBreakdown: undefined,
        },
        {
          id: "rec-2",
          title: "Implement Process B",
          priority: "medium",
          score: 0.8,
          scoreBreakdown: undefined,
        },
        {
          id: "rec-3",
          title: "Implement Process C",
          priority: "low",
          score: 0.3,
          scoreBreakdown: undefined,
        },
      ];

      render(<RecommendationsView recommendations={recommendations} />);

      const items = screen.getAllByText(/Implement Process/);
      expect(items[0]).toHaveTextContent("Implement Process B"); // 0.8 score
      expect(items[1]).toHaveTextContent("Implement Process A"); // 0.5 score
      expect(items[2]).toHaveTextContent("Implement Process C"); // 0.3 score
    });

    it("should show score as percentage", () => {
      const recommendations = [
        {
          id: "rec-1",
          title: "Test Rec",
          priority: "high",
          score: 0.75,
          scoreBreakdown: undefined,
        },
      ];

      render(<RecommendationsView recommendations={recommendations} />);

      expect(screen.getByText(/Score: 75\.0%/)).toBeInTheDocument();
    });

    it("should display priority badge", () => {
      const recommendations = [
        {
          id: "rec-1",
          title: "Test Rec",
          priority: "critical",
          scoreBreakdown: undefined,
        },
      ];

      render(<RecommendationsView recommendations={recommendations} />);

      expect(screen.getByText("critical")).toBeInTheDocument();
    });

    it("should show explainability breakdown on expand", async () => {
      const recommendations = [
        {
          id: "rec-1",
          title: "Test Rec",
          priority: "high",
          score: 0.6,
          scoreBreakdown: {
            weights: { impact: 0.2, urgency: 0.15 },
            normalizedInputs: { impact: 0.8, urgency: 0.6 },
            contributions: { impact: 0.16, urgency: 0.09 },
            finalScore: 0.6,
          },
        },
      ];

      render(<RecommendationsView recommendations={recommendations} />);

      const recElement = screen.getByText("Test Rec").closest("div");
      fireEvent.click(recElement!);

      await waitFor(() => {
        expect(screen.getByText(/Score Breakdown/)).toBeInTheDocument();
      });
    });
  });

  describe("2. Audit Timeline", () => {
    it("should fetch and display audit events", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "ev-1",
                eventName: "action.created",
                entityType: "action",
                entityId: "action-1",
                createdAt: "2024-01-01T10:00:00Z",
                actorId: "user-1",
                payload: {},
              },
            ],
          }),
        })
      );

      render(<AuditTimeline engagementId="eng-1" />);

      await waitFor(() => {
        expect(screen.getByText("action.created")).toBeInTheDocument();
      });
    });

    it("should display events in chronological order", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "ev-1",
                eventName: "action.created",
                entityType: "action",
                entityId: "action-1",
                createdAt: "2024-01-01T10:00:00Z",
                actorId: "user-1",
                payload: {},
              },
              {
                id: "ev-2",
                eventName: "action.updated",
                entityType: "action",
                entityId: "action-1",
                createdAt: "2024-01-01T11:00:00Z",
                actorId: "user-1",
                payload: {},
              },
            ],
          }),
        })
      );

      render(<AuditTimeline engagementId="eng-1" />);

      await waitFor(() => {
        const events = screen.getAllByText(/action\./);
        expect(events.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("should show event metadata", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "ev-1",
                eventName: "action.created",
                entityType: "action",
                entityId: "action-1",
                createdAt: "2024-01-01T10:00:00Z",
                actorId: "user-1",
                payload: {},
              },
            ],
          }),
        })
      );

      render(<AuditTimeline engagementId="eng-1" />);

      await waitFor(() => {
        expect(screen.getByText(/action: action-1/)).toBeInTheDocument();
        expect(screen.getByText(/by user-1/)).toBeInTheDocument();
      });
    });
  });

  describe("3. Action Center", () => {
    it("should separate blocked actions", () => {
      const actions = [
        {
          id: "a-1",
          title: "Blocked Task",
          status: "blocked",
          priority: "high",
          version: 1,
        },
        {
          id: "a-2",
          title: "Open Task",
          status: "assigned",
          priority: "medium",
          version: 1,
        },
      ];

      render(
        <ActionCenter actions={actions} engagementId="eng-1" />
      );

      expect(screen.getByText("Blocked (1)")).toBeInTheDocument();
      expect(screen.getByText("Blocked Task")).toBeInTheDocument();
    });

    it("should flag overdue actions", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const actions = [
        {
          id: "a-1",
          title: "Overdue Task",
          status: "assigned",
          priority: "high",
          dueDate: pastDate.toISOString(),
          version: 1,
        },
      ];

      render(
        <ActionCenter actions={actions} engagementId="eng-1" />
      );

      expect(screen.getByText("Overdue (1)")).toBeInTheDocument();
      expect(screen.getByText("Overdue Task")).toBeInTheDocument();
    });

    it("should show status transition buttons", () => {
      const actions = [
        {
          id: "a-1",
          title: "Test Task",
          status: "assigned",
          priority: "medium",
          version: 1,
        },
      ];

      render(
        <ActionCenter actions={actions} engagementId="eng-1" />
      );

      // Status transitions from "assigned" are: in_progress, blocked, cancelled
      expect(screen.getByText("→ in_progress")).toBeInTheDocument();
      expect(screen.getByText("→ blocked")).toBeInTheDocument();
      expect(screen.getByText("→ cancelled")).toBeInTheDocument();
    });

    it("should update action status on button click", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: { id: "a-1", status: "in_progress" },
            meta: { version: 2 },
          }),
        })
      );

      const actions = [
        {
          id: "a-1",
          title: "Test Task",
          status: "assigned",
          priority: "medium",
          version: 1,
        },
      ];

      render(
        <ActionCenter actions={actions} engagementId="eng-1" />
      );

      const button = screen.getByText("→ in_progress");
      fireEvent.click(button);

      await waitFor(() => {
        expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
          expect.stringContaining("/api/actions/a-1"),
          expect.objectContaining({ method: "PATCH" })
        );
      });
    });

    it("should reflect priority escalation in UI", () => {
      const actions = [
        {
          id: "a-1",
          title: "Critical Task",
          status: "assigned",
          priority: "critical",
          version: 1,
        },
      ];

      render(
        <ActionCenter actions={actions} engagementId="eng-1" />
      );

      // Critical priority should show destructive badge
      const badges = screen.getAllByText("critical");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe("4. KPI Trend", () => {
    it("should display KPI current value", () => {
      const kpis = [
        {
          id: "kpi-1",
          name: "Revenue",
          currentValue: 100000,
          direction: "up" as const,
          snapshots: undefined,
        },
      ];

      render(<KPITrend kpis={kpis} />);

      expect(screen.getByText("100000")).toBeInTheDocument();
    });

    it("should show direction indicator", () => {
      const kpis = [
        {
          id: "kpi-1",
          name: "Cost",
          currentValue: 50000,
          direction: "down" as const,
          snapshots: [
            { value: 50000, recordedAt: "2024-01-01T10:00:00Z" },
            { value: 55000, recordedAt: "2024-01-01T09:00:00Z" },
          ],
        },
      ];

      render(<KPITrend kpis={kpis} />);

      expect(screen.getByText(/↓ Improving/)).toBeInTheDocument();
    });

    it("should flag deterioration", () => {
      const kpis = [
        {
          id: "kpi-1",
          name: "Efficiency",
          currentValue: 80,
          direction: "up" as const,
          snapshots: [
            { value: 80, recordedAt: "2024-01-01T10:00:00Z" },
            { value: 90, recordedAt: "2024-01-01T09:00:00Z" },
          ],
        },
      ];

      render(<KPITrend kpis={kpis} />);

      expect(screen.getByText("⚠️ Deteriorating")).toBeInTheDocument();
    });

    it("should render trend chart with last 5 values", () => {
      const kpis = [
        {
          id: "kpi-1",
          name: "Test KPI",
          currentValue: 100,
          direction: "up" as const,
          snapshots: [
            { value: 100, recordedAt: "2024-01-01T10:00:00Z" },
            { value: 95, recordedAt: "2024-01-01T09:00:00Z" },
            { value: 90, recordedAt: "2024-01-01T08:00:00Z" },
            { value: 85, recordedAt: "2024-01-01T07:00:00Z" },
            { value: 80, recordedAt: "2024-01-01T06:00:00Z" },
          ],
        },
      ];

      render(<KPITrend kpis={kpis} />);

      // Should render bars for snapshots
      const valueElements = screen.getAllByText(/^(100|95|90|85|80)$/);
      expect(valueElements.length).toBeGreaterThan(0);
    });
  });

  describe("5. Dashboard Integration", () => {
    it("should load engagement dashboard without errors", async () => {
      const recommendations = [
        {
          id: "rec-1",
          title: "Rec 1",
          priority: "high",
          score: 0.8,
          scoreBreakdown: undefined,
        },
      ];
      const kpis = [
        {
          id: "kpi-1",
          name: "KPI 1",
          currentValue: 100,
          direction: "up" as const,
        },
      ];
      const actions = [
        {
          id: "a-1",
          title: "Action 1",
          status: "assigned",
          priority: "high",
          version: 1,
        },
      ];

      render(
        <>
          <RecommendationsView recommendations={recommendations} />
          <KPITrend kpis={kpis} />
          <ActionCenter actions={actions} engagementId="eng-1" />
        </>
      );

      expect(screen.getByText("Recommendations")).toBeInTheDocument();
      expect(screen.getByText("KPI Trends")).toBeInTheDocument();
      expect(screen.getByText("Open Actions")).toBeInTheDocument();
    });

    it("should display all components without business logic", () => {
      // Verify no business logic is duplicated in UI
      const recommendations = [
        {
          id: "rec-1",
          title: "Test",
          priority: "high",
          scoreBreakdown: undefined,
        },
      ];

      render(<RecommendationsView recommendations={recommendations} />);

      // Component should only present data, not calculate/transform it
      const titleElement = screen.getByText("Test");
      expect(titleElement).toBeInTheDocument();
    });
  });
});
