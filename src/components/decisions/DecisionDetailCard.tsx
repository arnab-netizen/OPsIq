"use client";

import { Badge } from "@/ui/primitives";

interface DecisionDetailProps {
  decision: {
    id: string;
    problem: string;
    action: string;
    impactExpected: number;
    impactLow: number;
    impactHigh: number;
    confidence: number;
    status: string;
    blockStage?: string;
    blockReason?: string;
    createdAt: string;
    createdBy: string;
    inputsSnapshot?: Record<string, unknown>;
  };
  auditTrail?: Array<{
    eventName: string;
    createdAt: string;
    actorId: string;
    metadata?: Record<string, unknown>;
  }>;
}

export function DecisionDetailCard({ decision, auditTrail = [] }: DecisionDetailProps) {
  const confidenceColor =
    decision.confidence > 0.7
      ? "bg-green-100 text-green-800"
      : decision.confidence > 0.4
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";

  const statusColor =
    decision.status === "approved"
      ? "bg-green-100 text-green-800"
      : decision.status === "blocked"
        ? "bg-red-100 text-red-800"
        : "bg-yellow-100 text-yellow-800";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{decision.problem}</h2>
            <p className="text-sm text-gray-600 mt-1">ID: {decision.id}</p>
          </div>
          <div className="flex gap-2">
            <Badge className={statusColor}>{decision.status}</Badge>
            <Badge className={confidenceColor}>{(decision.confidence * 100).toFixed(0)}% confidence</Badge>
          </div>
        </div>
      </div>

      {/* Decision Details */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
        <div>
          <p className="text-xs text-gray-600 font-medium">ACTION</p>
          <p className="text-sm mt-1">{decision.action}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600 font-medium">EXPECTED IMPACT</p>
          <p className="text-sm mt-1 font-mono">₹{(decision.impactExpected / 1000).toFixed(1)}k</p>
        </div>
        <div>
          <p className="text-xs text-gray-600 font-medium">IMPACT RANGE</p>
          <p className="text-sm mt-1 font-mono">
            ₹{(decision.impactLow / 1000).toFixed(0)}k - ₹{(decision.impactHigh / 1000).toFixed(0)}k
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 font-medium">CREATED</p>
          <p className="text-sm mt-1">{new Date(decision.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Block Reason (if blocked) */}
      {decision.blockStage && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <h3 className="font-semibold text-red-900 mb-2">BLOCK REASON</h3>
          <p className="text-sm text-red-800 mb-2">
            <strong>Stage:</strong> {decision.blockStage}
          </p>
          {decision.blockReason && (
            <p className="text-sm text-red-800">
              <strong>Details:</strong> {decision.blockReason}
            </p>
          )}
        </div>
      )}

      {/* Input Snapshot */}
      {decision.inputsSnapshot && (
        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold text-gray-900 mb-3">INPUT SNAPSHOT</h3>
          <div className="bg-white border rounded p-3 font-mono text-xs overflow-auto max-h-48">
            <pre>{JSON.stringify(decision.inputsSnapshot, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Audit Trail */}
      {auditTrail.length > 0 && (
        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold text-gray-900 mb-3">AUDIT TRAIL</h3>
          <div className="space-y-2">
            {auditTrail.map((event, idx) => (
              <div key={idx} className="border-l-2 border-gray-300 pl-4 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900">{event.eventName}</span>
                  <span className="text-xs text-gray-600">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-gray-600">Actor: {event.actorId}</p>
                {event.metadata && (
                  <details className="mt-1">
                    <summary className="text-xs text-blue-600 cursor-pointer">Details</summary>
                    <pre className="text-xs bg-white border rounded p-2 mt-1 overflow-auto">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
