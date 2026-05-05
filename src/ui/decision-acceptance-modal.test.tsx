import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionAcceptanceModal } from "./decision-acceptance-modal";

describe("DecisionAcceptanceModal", () => {
  const defaultProps = {
    decisionId: "dec-123",
    engagementId: "eng-456",
    decisionTitle: "Implement cost controls",
    expectedImpact: 75000,
    confidenceScore: 0.85,
    riskLevel: "medium" as const,
    isOpen: true,
    onClose: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
  };

  describe("View Mode", () => {
    it("should display decision information", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      expect(screen.getByText("Implement cost controls")).toBeInTheDocument();
      expect(screen.getByText(/75,000/)).toBeInTheDocument();
      expect(screen.getByText(/85%/)).toBeInTheDocument();
    });

    it("should display financial consequences", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      expect(screen.getByText("Financial Consequences")).toBeInTheDocument();
      expect(screen.getByText(/Expected Impact/)).toBeInTheDocument();
    });

    it("should display risk level alert for high risk", () => {
      const highRiskProps = { ...defaultProps, riskLevel: "high" as const };
      render(<DecisionAcceptanceModal {...highRiskProps} />);

      expect(screen.getByText(/high financial risk/)).toBeInTheDocument();
    });

    it("should display risk level alert for medium risk", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      expect(screen.getByText(/medium financial risk/)).toBeInTheDocument();
    });

    it("should provide Accept and Reject buttons", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      expect(screen.getByRole("button", { name: /Accept Decision/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reject Decision/ })).toBeInTheDocument();
    });

    it("should close modal when close button clicked", () => {
      const onClose = vi.fn();
      const { container } = render(
        <DecisionAcceptanceModal {...defaultProps} onClose={onClose} />
      );

      // Find close button in modal header
      const closeButtons = screen.getAllByRole("button");
      const closeButton = closeButtons[0]; // First button is typically the close button

      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Accept Mode", () => {
    it("should switch to accept mode when Accept button clicked", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      const acceptButton = screen.getByRole("button", { name: /Accept Decision/ });
      fireEvent.click(acceptButton);

      expect(screen.getByText("Accept Decision")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Optional: Explain/)).toBeInTheDocument();
    });

    it("should allow entering rationale", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      const acceptButton = screen.getByRole("button", { name: /Accept Decision/ });
      fireEvent.click(acceptButton);

      const textarea = screen.getByPlaceholderText(/Optional: Explain/) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: { value: "This decision aligns with strategic goals" },
      });

      expect(textarea.value).toBe("This decision aligns with strategic goals");
    });

    it("should call onAccept with rationale", async () => {
      const onAccept = vi.fn().mockResolvedValue(undefined);
      render(
        <DecisionAcceptanceModal {...defaultProps} onAccept={onAccept} />
      );

      const acceptButton = screen.getByRole("button", { name: /Accept Decision/ });
      fireEvent.click(acceptButton);

      const textarea = screen.getByPlaceholderText(/Optional: Explain/) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Test rationale" } });

      const confirmButton = screen.getByRole("button", { name: /Confirm Acceptance/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onAccept).toHaveBeenCalledWith("Test rationale");
      });
    });

    it("should close modal after successful acceptance", async () => {
      const onClose = vi.fn();
      const onAccept = vi.fn().mockResolvedValue(undefined);
      render(
        <DecisionAcceptanceModal
          {...defaultProps}
          onAccept={onAccept}
          onClose={onClose}
        />
      );

      const acceptButton = screen.getByRole("button", { name: /Accept Decision/ });
      fireEvent.click(acceptButton);

      const confirmButton = screen.getByRole("button", { name: /Confirm Acceptance/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("should display error on acceptance failure", async () => {
      const onAccept = vi.fn().mockRejectedValue(new Error("Acceptance failed"));
      render(
        <DecisionAcceptanceModal {...defaultProps} onAccept={onAccept} />
      );

      const acceptButton = screen.getByRole("button", { name: /Accept Decision/ });
      fireEvent.click(acceptButton);

      const confirmButton = screen.getByRole("button", { name: /Confirm Acceptance/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("Acceptance failed")).toBeInTheDocument();
      });
    });

    it("should allow back navigation from accept mode", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      const acceptButton = screen.getByRole("button", { name: /Accept Decision/ });
      fireEvent.click(acceptButton);

      const backButton = screen.getByRole("button", { name: /Back/ });
      fireEvent.click(backButton);

      expect(screen.getByText("Decision Review")).toBeInTheDocument();
    });
  });

  describe("Reject Mode", () => {
    it("should switch to reject mode when Reject button clicked", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      const rejectButton = screen.getByRole("button", { name: /Reject Decision/ });
      fireEvent.click(rejectButton);

      expect(screen.getByText("Reject Decision")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Required: Explain/)).toBeInTheDocument();
    });

    it("should enforce minimum reason length", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      const rejectButton = screen.getByRole("button", { name: /Reject Decision/ });
      fireEvent.click(rejectButton);

      const textarea = screen.getByPlaceholderText(/Required: Explain/) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Short" } });

      const confirmButton = screen.getByRole("button", { name: /Confirm Rejection/ });
      expect(confirmButton).toBeDisabled();
    });

    it("should call onReject with reason", async () => {
      const onReject = vi.fn().mockResolvedValue(undefined);
      render(
        <DecisionAcceptanceModal {...defaultProps} onReject={onReject} />
      );

      const rejectButton = screen.getByRole("button", { name: /Reject Decision/ });
      fireEvent.click(rejectButton);

      const textarea = screen.getByPlaceholderText(/Required: Explain/) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: {
          value: "Risk assessment indicates potential financial exposure",
        },
      });

      const confirmButton = screen.getByRole("button", { name: /Confirm Rejection/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onReject).toHaveBeenCalledWith(
          "Risk assessment indicates potential financial exposure"
        );
      });
    });

    it("should close modal after successful rejection", async () => {
      const onClose = vi.fn();
      const onReject = vi.fn().mockResolvedValue(undefined);
      render(
        <DecisionAcceptanceModal
          {...defaultProps}
          onReject={onReject}
          onClose={onClose}
        />
      );

      const rejectButton = screen.getByRole("button", { name: /Reject Decision/ });
      fireEvent.click(rejectButton);

      const textarea = screen.getByPlaceholderText(/Required: Explain/) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: { value: "Technical constraints prevent implementation" },
      });

      const confirmButton = screen.getByRole("button", { name: /Confirm Rejection/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("should display error on rejection failure", async () => {
      const onReject = vi.fn().mockRejectedValue(new Error("Rejection failed"));
      render(
        <DecisionAcceptanceModal {...defaultProps} onReject={onReject} />
      );

      const rejectButton = screen.getByRole("button", { name: /Reject Decision/ });
      fireEvent.click(rejectButton);

      const textarea = screen.getByPlaceholderText(/Required: Explain/) as HTMLTextAreaElement;
      fireEvent.change(textarea, {
        target: { value: "Risk assessment indicates exposure" },
      });

      const confirmButton = screen.getByRole("button", { name: /Confirm Rejection/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("Rejection failed")).toBeInTheDocument();
      });
    });

    it("should allow back navigation from reject mode", () => {
      render(<DecisionAcceptanceModal {...defaultProps} />);

      const rejectButton = screen.getByRole("button", { name: /Reject Decision/ });
      fireEvent.click(rejectButton);

      const backButton = screen.getByRole("button", { name: /Back/ });
      fireEvent.click(backButton);

      expect(screen.getByText("Decision Review")).toBeInTheDocument();
    });
  });

  describe("Modal Lifecycle", () => {
    it("should not render when isOpen is false", () => {
      const { container } = render(
        <DecisionAcceptanceModal {...defaultProps} isOpen={false} />
      );

      expect(container.querySelector("[role=dialog]")).not.toBeInTheDocument();
    });

    it("should render when isOpen is true", () => {
      const { container } = render(
        <DecisionAcceptanceModal {...defaultProps} isOpen={true} />
      );

      expect(container.querySelector("[role=dialog]")).toBeInTheDocument();
    });

    it("should show low risk without alert when applicable", () => {
      const lowRiskProps = { ...defaultProps, riskLevel: "low" as const };
      render(<DecisionAcceptanceModal {...lowRiskProps} />);

      expect(screen.queryByText(/high financial risk/)).not.toBeInTheDocument();
      expect(screen.queryByText(/medium financial risk/)).not.toBeInTheDocument();
    });
  });
});
