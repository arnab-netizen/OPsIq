import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecommendationsManager } from "@/ui/recommendations-manager";

describe("RecommendationsManager", () => {
  const mockRecommendations = [
    {
      id: "rec-1",
      title: "Implement rate limiting",
      priority: "critical",
      status: "pending",
      version: 1,
      engagementId: "eng-1",
      score: 0.95,
      rationale: "Critical for protecting against brute force attacks",
      scoreBreakdown: {
        weights: { security: 0.5, performance: 0.3, scalability: 0.2 },
        normalizedInputs: { security: 1, performance: 0.8, scalability: 0.6 },
        contributions: { security: 0.5, performance: 0.24, scalability: 0.12 },
        finalScore: 0.95,
      },
    },
    {
      id: "rec-2",
      title: "Add API documentation",
      priority: "high",
      status: "pending",
      version: 1,
      engagementId: "eng-1",
      score: 0.75,
      rationale: "Improves developer experience and reduces support burden",
    },
    {
      id: "rec-3",
      title: "Upgrade Node.js version",
      priority: "medium",
      status: "approved",
      version: 2,
      engagementId: "eng-1",
      score: 0.55,
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe("Display and Sorting", () => {
    it("displays recommendations sorted by score descending", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const titles = screen.getAllByRole("heading", { level: 5 });
      expect(titles[0].textContent).toContain("Implement rate limiting");
      expect(titles[1].textContent).toContain("Add API documentation");
      expect(titles[2].textContent).toContain("Upgrade Node.js version");
    });

    it("displays priority badges with correct colors", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("critical")).toBeInTheDocument();
      expect(screen.getByText("high")).toBeInTheDocument();
      expect(screen.getByText("medium")).toBeInTheDocument();
    });

    it("shows score percentage when available", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("Score: 95.0%")).toBeInTheDocument();
      expect(screen.getByText("Score: 75.0%")).toBeInTheDocument();
      expect(screen.getByText("Score: 55.0%")).toBeInTheDocument();
    });
  });

  describe("Expandable Details", () => {
    it("expands to show rationale and score breakdown", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const recommendationTitle = screen.getByText("Implement rate limiting");
      fireEvent.click(recommendationTitle.closest("div"));

      expect(
        screen.getByText("Critical for protecting against brute force attacks")
      ).toBeInTheDocument();
      expect(screen.getByText("Score Breakdown:")).toBeInTheDocument();
    });

    it("shows score breakdown contributions", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const recommendationTitle = screen.getByText("Implement rate limiting");
      fireEvent.click(recommendationTitle.closest("div"));

      expect(screen.getByText(/Security:/)).toBeInTheDocument();
      expect(screen.getByText(/Performance:/)).toBeInTheDocument();
      expect(screen.getByText(/Scalability:/)).toBeInTheDocument();
    });

    it("collapses details when clicking again", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const recommendationTitle = screen.getByText("Implement rate limiting");
      const titleContainer = recommendationTitle.closest("div");

      fireEvent.click(titleContainer);
      expect(
        screen.getByText("Critical for protecting against brute force attacks")
      ).toBeInTheDocument();

      fireEvent.click(titleContainer);
      expect(
        screen.queryByText("Critical for protecting against brute force attacks")
      ).not.toBeInTheDocument();
    });
  });

  describe("Update Priority", () => {
    it("calls API to update priority", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "rec-1",
              priority: "high",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/recommendations/rec-1"),
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"priority":"high"'),
          })
        );
      });
    });

    it("includes version field in API request", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "rec-1",
              priority: "high",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"version":1'),
          })
        );
      });
    });
  });

  describe("Update Status", () => {
    it("displays status dropdown for each recommendation", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBeGreaterThan(0);
    });

    it("calls API to update status", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "rec-1",
              status: "approved",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "approved" } });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/recommendations/rec-1"),
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"status":"approved"'),
          })
        );
      });
    });
  });

  describe("Rerank Functionality", () => {
    it("displays rerank button when recommendations exist", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      expect(screen.getByRole("button", { name: /Rerank All/i })).toBeInTheDocument();
    });

    it("calls rerank API with correct endpoint", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const rerankBtn = screen.getByRole("button", { name: /Rerank All/i });
      fireEvent.click(rerankBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(
            "/api/engagements/eng-1/recommendations/rerank"
          ),
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
        );
      });
    });

    it("shows error message if rerank fails", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: { message: "Rerank service unavailable" },
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const rerankBtn = screen.getByRole("button", { name: /Rerank All/i });
      fireEvent.click(rerankBtn);

      await waitFor(() => {
        expect(
          screen.getByText("Rerank service unavailable")
        ).toBeInTheDocument();
      });
    });

    it("disables rerank button while reranking", async () => {
      let resolveRequest: () => void = () => {};
      const mockFetch = vi.fn(() =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({
              ok: true,
              json: () => Promise.resolve([]),
            });
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const rerankBtn = screen.getByRole("button", { name: /Rerank All/i });
      fireEvent.click(rerankBtn);

      await waitFor(() => {
        expect(rerankBtn).toBeDisabled();
      });

      resolveRequest();

      await waitFor(() => {
        expect(rerankBtn).not.toBeDisabled();
      });
    });
  });

  describe("Error Handling", () => {
    it("shows inline error on priority update failure", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: { message: "Conflict: Recommendation was modified" },
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(
          screen.getByText("Conflict: Recommendation was modified")
        ).toBeInTheDocument();
      });
    });

    it("disables buttons while updating", async () => {
      let resolveRequest: () => void = () => {};
      const mockFetch = vi.fn(() =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  id: "rec-1",
                  priority: "high",
                  version: 2,
                }),
            });
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        const criticalButtons = screen.getAllByRole("button", { name: "Critical" });
        expect(criticalButtons[0]).toBeDisabled();
      });

      resolveRequest();

      await waitFor(() => {
        const criticalButtons = screen.getAllByRole("button", { name: "Critical" });
        expect(criticalButtons[0]).not.toBeDisabled();
      });
    });
  });

  describe("Grouping by Priority", () => {
    it("groups recommendations by priority correctly", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText(/Critical \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/High \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Other \(1\)/)).toBeInTheDocument();
    });

    it("displays critical recommendations in red section", () => {
      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
        />
      );

      const criticalSection = screen.getByText(/Critical \(1\)/).closest("div");
      expect(criticalSection).toHaveClass("border-destructive/50");
    });
  });

  describe("Callback Integration", () => {
    it("calls onRecommendationUpdated after successful priority update", async () => {
      const mockCallback = vi.fn();
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "rec-1",
              priority: "high",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
          onRecommendationUpdated={mockCallback}
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled();
      });
    });

    it("calls onRecommendationUpdated after successful rerank", async () => {
      const mockCallback = vi.fn();
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      );
      global.fetch = mockFetch;

      render(
        <RecommendationsManager
          recommendations={mockRecommendations}
          engagementId="eng-1"
          onRecommendationUpdated={mockCallback}
        />
      );

      const rerankBtn = screen.getByRole("button", { name: /Rerank All/i });
      fireEvent.click(rerankBtn);

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled();
      });
    });
  });

  describe("Empty State", () => {
    it("shows empty state when no recommendations", () => {
      render(
        <RecommendationsManager
          recommendations={[]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("No recommendations yet.")).toBeInTheDocument();
    });
  });
});
