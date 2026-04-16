"use client";

import { Modal } from "@/ui/primitives/modal";
import { Badge } from "@/ui/primitives";
import { Button } from "@/ui/primitives";

interface ShockEvent {
  id: string;
  type: string;
  severity: string;
  happenedAt: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

const TYPE_LABELS: Record<string, string> = {
  KEY_EMPLOYEE_LOSS: "Key Employee Loss",
  MAJOR_CLIENT_LOSS: "Major Client Loss",
  PAYROLL_PRESSURE: "Payroll Pressure",
  MARGIN_COLLAPSE: "Margin Collapse",
  SUPPLIER_FAILURE: "Supplier Failure",
  SERVICE_BREAKDOWN: "Service Breakdown",
  COMPLIANCE_ISSUE: "Compliance Issue",
  REPUTATION_DAMAGE: "Reputation Damage",
  INTERNAL_CONFLICT: "Internal Conflict",
  OWNER_WITHDRAWAL: "Owner Withdrawal",
  EXECUTION_STALL: "Execution Stall",
};

const SEVERITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

interface ShockEventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: ShockEvent;
}

export default function ShockEventDetailModal({
  isOpen,
  onClose,
  event,
}: ShockEventDetailModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Shock Event Details"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <dl className="space-y-4">
        <div>
          <dt className="text-sm text-muted-foreground">Type</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {TYPE_LABELS[event.type] || event.type}
          </dd>
        </div>

        <div>
          <dt className="text-sm text-muted-foreground">Severity</dt>
          <dd className="mt-1">
            <Badge variant={SEVERITY_VARIANTS[event.severity] || "muted"}>
              {event.severity}
            </Badge>
          </dd>
        </div>

        <div>
          <dt className="text-sm text-muted-foreground">Date & Time</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {new Date(event.happenedAt).toLocaleDateString()} at{" "}
            {new Date(event.happenedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </dd>
        </div>

        {event.notes && (
          <div>
            <dt className="text-sm text-muted-foreground">Notes</dt>
            <dd className="mt-1 text-sm text-foreground whitespace-pre-wrap">
              {event.notes}
            </dd>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <dt className="text-xs text-muted-foreground uppercase">Recorded</dt>
          <dd className="mt-2 text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleDateString()} at{" "}
            {new Date(event.createdAt).toLocaleTimeString()}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}
