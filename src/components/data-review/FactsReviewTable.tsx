/**
 * Facts Review Table — display extracted facts for owner review/correction.
 *
 * Shows facts with columns: metric, value, source, confidence, validation_status.
 * Provides action buttons for each row (approve, edit, reject, mark unknown).
 * No DB access; pure component that calls parent handlers.
 */
"use client";

import React from "react";
import type { FactReviewAction } from "@/services/data-review/fact-review.service";

export interface FactRow {
  factId: string;
  metric: string;
  value: unknown;
  unit: string;
  sourceDocumentKind: string;
  confidenceScore: number;
  validationStatus: "draft" | "owner_confirmed" | "system_validated" | "rejected" | "unknown";
  sourceLocation: string;
}

export interface FactsReviewTableProps {
  facts: FactRow[];
  reviewActions: FactReviewAction[];
  onApprove: (factId: string) => Promise<void>;
  onEdit: (factId: string, newValue: unknown) => Promise<void>;
  onReject: (factId: string, reason: string | null) => Promise<void>;
  onMarkUnknown: (factId: string) => Promise<void>;
  loading?: boolean;
}

function getReviewStatus(
  factId: string,
  actions: FactReviewAction[]
): "approved" | "corrected" | "rejected" | "unknown" | null {
  const relevantActions = actions.filter((a) => a.factId === factId);
  if (relevantActions.length === 0) return null;
  const lastAction = relevantActions[relevantActions.length - 1];
  return (lastAction.action as "approved" | "corrected" | "rejected" | "unknown") || null;
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case "approved":
    case "owner_confirmed":
      return "bg-green-100 text-green-800";
    case "corrected":
      return "bg-blue-100 text-blue-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "unknown":
      return "bg-gray-100 text-gray-800";
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function FactsReviewTable({
  facts,
  reviewActions,
  onApprove,
  onEdit,
  onReject,
  onMarkUnknown,
  loading = false,
}: FactsReviewTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Metric</th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Value</th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Source</th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Confidence</th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Status</th>
            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((fact) => {
            const reviewStatus = getReviewStatus(fact.factId, reviewActions);
            const displayStatus = reviewStatus || fact.validationStatus;
            const statusBadgeColor = getStatusBadgeColor(displayStatus);

            return (
              <tr key={fact.factId} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 text-sm">{fact.metric}</td>
                <td className="border border-gray-300 px-4 py-2 text-sm font-mono">
                  {String(fact.value ?? "(null)")}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm text-xs">
                  <div className="font-semibold">{fact.sourceDocumentKind}</div>
                  <div className="text-gray-600">{fact.sourceLocation}</div>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  <div className="font-semibold">{(fact.confidenceScore * 100).toFixed(0)}%</div>
                  <div className="h-2 w-12 rounded bg-gray-200">
                    <div
                      className="h-full rounded bg-blue-500"
                      style={{ width: `${fact.confidenceScore * 100}%` }}
                    />
                  </div>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusBadgeColor}`}>
                    {displayStatus}
                  </span>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  <FactActionButtons
                    factId={fact.factId}
                    currentStatus={displayStatus}
                    onApprove={onApprove}
                    onEdit={onEdit}
                    onReject={onReject}
                    onMarkUnknown={onMarkUnknown}
                    disabled={loading}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {facts.length === 0 && (
        <div className="p-4 text-center text-gray-500">No facts to review</div>
      )}
    </div>
  );
}

interface FactActionButtonsProps {
  factId: string;
  currentStatus: string;
  onApprove: (factId: string) => Promise<void>;
  onEdit: (factId: string, newValue: unknown) => Promise<void>;
  onReject: (factId: string, reason: string | null) => Promise<void>;
  onMarkUnknown: (factId: string) => Promise<void>;
  disabled?: boolean;
}

function FactActionButtons({
  factId,
  currentStatus,
  onApprove,
  onEdit,
  onReject,
  onMarkUnknown,
  disabled = false,
}: FactActionButtonsProps) {
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [showRejectModal, setShowRejectModal] = React.useState(false);

  const handleApprove = async () => {
    try {
      await onApprove(factId);
    } catch (error) {
      console.error("Failed to approve fact:", error);
    }
  };

  const handleReject = async (reason: string) => {
    try {
      await onReject(factId, reason || null);
      setShowRejectModal(false);
    } catch (error) {
      console.error("Failed to reject fact:", error);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {currentStatus !== "approved" && currentStatus !== "owner_confirmed" && (
          <button
            onClick={handleApprove}
            disabled={disabled}
            className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600 disabled:opacity-50"
            title="Approve this fact"
          >
            ✓ Approve
          </button>
        )}
        {currentStatus !== "rejected" && (
          <button
            onClick={() => setShowEditModal(true)}
            disabled={disabled}
            className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
            title="Edit the value"
          >
            Edit
          </button>
        )}
        {currentStatus !== "rejected" && (
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={disabled}
            className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
            title="Reject this fact"
          >
            ✗ Reject
          </button>
        )}
        {currentStatus !== "unknown" && (
          <button
            onClick={() => onMarkUnknown(factId)}
            disabled={disabled}
            className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600 disabled:opacity-50"
            title="Mark as unknown"
          >
            ? Unknown
          </button>
        )}
      </div>

      {showEditModal && (
        <EditFactModal
          factId={factId}
          onSave={async (newValue) => {
            await onEdit(factId, newValue);
            setShowEditModal(false);
          }}
          onCancel={() => setShowEditModal(false)}
        />
      )}

      {showRejectModal && (
        <RejectReasonModal
          factId={factId}
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
    </>
  );
}

interface EditFactModalProps {
  factId: string;
  onSave: (newValue: unknown) => Promise<void>;
  onCancel: () => void;
}

function EditFactModal({ factId, onSave, onCancel }: EditFactModalProps) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Edit Fact Value</h2>
        <p className="mb-4 text-sm text-gray-600">Fact ID: {factId}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter new value"
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded bg-gray-300 px-4 py-2 text-sm hover:bg-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RejectReasonModalProps {
  factId: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

function RejectReasonModal({ factId, onConfirm, onCancel }: RejectReasonModalProps) {
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleConfirm = async () => {
    try {
      setSaving(true);
      await onConfirm(reason);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Reject Fact</h2>
        <p className="mb-4 text-sm text-gray-600">Fact ID: {factId}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you rejecting this fact? (optional)"
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
          rows={3}
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded bg-gray-300 px-4 py-2 text-sm hover:bg-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="rounded bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50"
          >
            {saving ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
