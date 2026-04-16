"use client";

import { useState } from "react";
import { Modal } from "@/ui/primitives/modal";
import { Button, Input, Select, Textarea } from "@/ui/primitives";

const SHOCK_EVENT_TYPES = [
  { value: "KEY_EMPLOYEE_LOSS", label: "Key Employee Loss" },
  { value: "MAJOR_CLIENT_LOSS", label: "Major Client Loss" },
  { value: "PAYROLL_PRESSURE", label: "Payroll Pressure" },
  { value: "MARGIN_COLLAPSE", label: "Margin Collapse" },
  { value: "SUPPLIER_FAILURE", label: "Supplier Failure" },
  { value: "SERVICE_BREAKDOWN", label: "Service Breakdown" },
  { value: "COMPLIANCE_ISSUE", label: "Compliance Issue" },
  { value: "REPUTATION_DAMAGE", label: "Reputation Damage" },
  { value: "INTERNAL_CONFLICT", label: "Internal Conflict" },
  { value: "OWNER_WITHDRAWAL", label: "Owner Withdrawal" },
  { value: "EXECUTION_STALL", label: "Execution Stall" },
];

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

interface CreateShockEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  engagementId: string;
  onSuccess: () => void;
}

export default function CreateShockEventModal({
  isOpen,
  onClose,
  engagementId,
  onSuccess,
}: CreateShockEventModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: "",
    severity: "",
    happenedAt: new Date().toISOString().split("T")[0],
    notes: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!formData.type || !formData.severity || !formData.happenedAt) {
        throw new Error("Type, severity, and happened at date are required");
      }

      const res = await fetch(
        `/api/engagements/${engagementId}/shock-events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: formData.type,
            severity: formData.severity,
            happenedAt: formData.happenedAt,
            ...(formData.notes && { notes: formData.notes }),
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create shock event");
      }

      // Reset form
      setFormData({
        type: "",
        severity: "",
        happenedAt: new Date().toISOString().split("T")[0],
        notes: "",
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Shock Event"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="create-shock-event-form"
            type="submit"
            isLoading={isSubmitting}
          >
            Record
          </Button>
        </>
      }
    >
      <form id="create-shock-event-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Select
          name="type"
          label="Shock Event Type"
          required
          value={formData.type}
          onChange={handleChange}
          options={SHOCK_EVENT_TYPES}
          placeholder="Select shock event type..."
        />

        <Select
          name="severity"
          label="Severity"
          required
          value={formData.severity}
          onChange={handleChange}
          options={SEVERITY_OPTIONS}
          placeholder="Select severity level..."
        />

        <Input
          name="happenedAt"
          label="Date/Time of Shock Event"
          type="date"
          required
          value={formData.happenedAt}
          onChange={handleChange}
        />

        <Textarea
          name="notes"
          label="Notes (optional)"
          rows={3}
          value={formData.notes}
          onChange={handleChange}
          placeholder="Add any additional context or details about this shock event..."
        />
      </form>
    </Modal>
  );
}
