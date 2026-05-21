"use client";

import { useState } from "react";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/lib/operator-error-governance";
import { Modal } from "@/ui/primitives/modal";
import { Button } from "@/ui/primitives/button";
import { logger } from "@/infra/logger";

export interface DecisionAcceptanceModalProps {
  decisionId: string;
  engagementId: string;
  decisionTitle: string;
  expectedImpact: number;
  confidenceScore: number;
  riskLevel: "low" | "medium" | "high";
  isOpen: boolean;
  onClose: () => void;
  onAccept: (rationale?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
}

export function DecisionAcceptanceModal({
  decisionId,
  engagementId,
  decisionTitle,
  expectedImpact,
  confidenceScore,
  riskLevel,
  isOpen,
  onClose,
  onAccept,
  onReject,
}: DecisionAcceptanceModalProps) {
  const [mode, setMode] = useState<"view" | "accept" | "reject">("view");
  const [acceptRationale, setAcceptRationale] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await onAccept(acceptRationale);
      logger.info("Decision accepted via modal", {
        decisionId,
        engagementId,
      });
      onClose();
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "action" });
      const message = governed.operatorMessage;
      setError(message);
      logger.error("Error accepting decision", {
        decisionId,
        error: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError("Rejection reason is required");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await onReject(rejectReason);
      logger.info("Decision rejected via modal", {
        decisionId,
        engagementId,
      });
      onClose();
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "action" });
      const message = governed.operatorMessage;
      setError(message);
      logger.error("Error rejecting decision", {
        decisionId,
        error: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const modalTitle =
    mode === "view"
      ? "Decision Review"
      : mode === "accept"
      ? "Accept Decision"
      : "Reject Decision";

  const getRiskBadgeClass = () => {
    if (riskLevel === "high") return "bg-red-100 text-red-900 border-red-300";
    if (riskLevel === "medium") return "bg-yellow-100 text-yellow-900 border-yellow-300";
    return "bg-green-100 text-green-900 border-green-300";
  };

  const getRiskMessage = () => {
    if (riskLevel === "high") return "This decision carries high financial risk";
    if (riskLevel === "medium") return "This decision carries medium financial risk";
    return null;
  };

  const renderContent = () => {
    if (mode === "view") {
      return (
        <div className="space-y-4">
          {/* Decision Title */}
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
            <p className="text-lg font-bold text-slate-900">{decisionTitle}</p>
          </div>

          {/* Financial Consequences */}
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-2">
              Financial Consequences
            </p>
            <p className="text-sm text-blue-700">
              Expected Impact: ${expectedImpact.toLocaleString()}
            </p>
            <p className="text-sm text-blue-700">
              Confidence: {(confidenceScore * 100).toFixed(0)}%
            </p>
          </div>

          {/* Risk Level Badge */}
          {getRiskMessage() && (
            <div className={`rounded-lg border p-4 ${getRiskBadgeClass()}`}>
              <p className="text-sm font-semibold">{getRiskMessage()}</p>
              <p className="text-xs mt-1">Review carefully before acceptance.</p>
            </div>
          )}

          {/* Decision Details */}
          <div className="space-y-2 rounded-lg bg-gray-50 p-4 border border-gray-200">
            <div>
              <p className="text-xs font-semibold text-gray-600">Decision ID</p>
              <p className="font-mono text-xs text-gray-700">
                {decisionId.slice(0, 8)}...
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600">Engagement</p>
              <p className="font-mono text-xs text-gray-700">
                {engagementId.slice(0, 8)}...
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (mode === "accept") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Confirm acceptance of this decision and provide your rationale.
          </p>
          <textarea
            placeholder="Optional: Explain your reasoning for accepting this decision..."
            value={acceptRationale}
            onChange={(e) => setAcceptRationale(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder-gray-500 focus:border-primary focus:ring-primary"
            rows={4}
          />
        </div>
      );
    }

    if (mode === "reject") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Provide a reason for rejecting this decision.
          </p>
          <textarea
            placeholder="Required: Explain why you are rejecting this decision..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder-gray-500 focus:border-primary focus:ring-primary"
            rows={4}
          />
          {rejectReason.length > 0 && rejectReason.length < 10 && (
            <p className="text-xs text-gray-500">
              Minimum 10 characters required ({rejectReason.length}/10)
            </p>
          )}
        </div>
      );
    }
  };

  const renderFooter = () => {
    if (mode === "view") {
      return (
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setMode("reject");
              setError(null);
            }}
          >
            Reject Decision
          </Button>
          <Button
            onClick={() => {
              setMode("accept");
              setError(null);
            }}
          >
            Accept Decision
          </Button>
        </>
      );
    }

    if (mode === "accept") {
      return (
        <>
          <Button
            variant="outline"
            onClick={() => setMode("view")}
            disabled={isLoading}
          >
            Back
          </Button>
          <Button onClick={handleAccept} disabled={isLoading} isLoading={isLoading}>
            {isLoading ? "Accepting..." : "Confirm Acceptance"}
          </Button>
        </>
      );
    }

    if (mode === "reject") {
      return (
        <>
          <Button
            variant="outline"
            onClick={() => setMode("view")}
            disabled={isLoading}
          >
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isLoading || rejectReason.length < 10}
            isLoading={isLoading}
          >
            {isLoading ? "Rejecting..." : "Confirm Rejection"}
          </Button>
        </>
      );
    }
  };

  const content = (
    <div className="space-y-4">
      {renderContent()}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-900 font-semibold">Error</p>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
        {renderFooter()}
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} footer={null}>
      {content}
    </Modal>
  );
}
