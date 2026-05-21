"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Badge, Table, LoadingState, EmptyState, ErrorState } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { ManualEvidenceForm } from "./manual-evidence-form";
import { FileUploadForm } from "./file-upload-form";

interface EvidenceItem {
  id: string;
  category: string;
  evidenceType: string;
  sourceType: string;
  sourceLabel: string;
  title: string;
  validationStatus: string;
  visibility: string;
  capturedAt: string;
  createdAt: string;
  _count: { bundleItems: number };
}

const CATEGORY_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  FINANCIAL: "default",
  OPERATIONAL: "success",
  HUMAN: "warning",
  RESILIENCE: "warning",
  CLIENT: "default",
  COMMERCIAL: "default",
  LEADERSHIP: "warning",
  EXECUTION: "success",
};

const VALIDATION_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  PENDING: "muted",
  VALIDATED: "success",
  INVALID: "destructive",
};

export default function EvidenceVaultPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  useEffect(() => {
    params.then((p) => setEngagementId(p.engagementId));
  }, [params]);

  useEffect(() => {
    if (!engagementId) return;

    async function fetchEvidence() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/evidence?engagementId=${engagementId}&limit=50`
        );
        if (!res.ok) {
          throw new Error("Failed to load evidence");
        }
        const data = await res.json();
        setEvidence(data.items ?? []);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'load' });
        setError(governed.operatorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvidence();
  }, [engagementId]);

  function handleEvidenceCreated() {
    setShowManualForm(false);
    setShowUploadForm(false);
    // Refetch evidence
    if (engagementId) {
      fetch(`/api/evidence?engagementId=${engagementId}&limit=50`)
        .then((res) => res.json())
        .then((data) => setEvidence(data.items ?? []))
        .catch(() => {});
    }
  }

  if (!engagementId) {
    return <LoadingState />;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/engagements" className="hover:text-foreground">
          Engagements
        </Link>
        <span>/</span>
        <Link
          href={`/engagements/${engagementId}`}
          className="hover:text-foreground"
        >
          Details
        </Link>
        <span>/</span>
        <span className="text-foreground">Evidence</span>
      </div>

      {/* Header */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Evidence Vault</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage evidence and documentation for this engagement.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowUploadForm(true)}
            variant="outline"
          >
            Upload File
          </Button>
          <Button onClick={() => setShowManualForm(true)}>
            Add Manual Evidence
          </Button>
        </div>
      </div>

      {/* Forms */}
      {showManualForm && (
        <ManualEvidenceForm
          engagementId={engagementId}
          onSuccess={handleEvidenceCreated}
          onCancel={() => setShowManualForm(false)}
        />
      )}

      {showUploadForm && (
        <FileUploadForm
          engagementId={engagementId}
          onSuccess={handleEvidenceCreated}
          onCancel={() => setShowUploadForm(false)}
        />
      )}

      {/* Content */}
      <div className="mt-8">
        {error && (
          <ErrorState
            title="Failed to load evidence"
            message={error}
            onRetry={() => {
              if (engagementId) {
                fetch(`/api/evidence?engagementId=${engagementId}&limit=50`)
                  .then((res) => res.json())
                  .then((data) => {
                    setEvidence(data.items ?? []);
                    setError(null);
                  })
                  .catch((err) => {
                    setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
                  });
              }
            }}
          />
        )}

        {isLoading && !error && <LoadingState message="Loading evidence..." />}

        {!isLoading && !error && evidence.length === 0 && (
          <EmptyState
            title="No evidence yet"
            description="Add evidence by uploading files or entering manual information."
            action={
              <div className="flex gap-2">
                <Button onClick={() => setShowManualForm(true)}>
                  Add Manual Evidence
                </Button>
                <Button
                  onClick={() => setShowUploadForm(true)}
                  variant="outline"
                >
                  Upload File
                </Button>
              </div>
            }
          />
        )}

        {!isLoading && !error && evidence.length > 0 && (
          <Table
            columns={[
              {
                key: "title",
                header: "Title",
                render: (item: EvidenceItem) => (
                  <Link
                    href={`/engagements/${engagementId}/evidence/${item.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {item.title}
                  </Link>
                ),
              },
              {
                key: "category",
                header: "Category",
                render: (item: EvidenceItem) => (
                  <Badge variant={CATEGORY_COLORS[item.category] ?? "muted"}>
                    {item.category}
                  </Badge>
                ),
              },
              {
                key: "evidenceType",
                header: "Type",
                render: (item: EvidenceItem) => (
                  <span className="text-sm">{item.evidenceType.replace(/_/g, " ")}</span>
                ),
              },
              {
                key: "sourceLabel",
                header: "Source",
                render: (item: EvidenceItem) => (
                  <span className="text-sm text-muted-foreground">
                    {item.sourceLabel}
                  </span>
                ),
              },
              {
                key: "validationStatus",
                header: "Status",
                render: (item: EvidenceItem) => (
                  <Badge variant={VALIDATION_COLORS[item.validationStatus] ?? "muted"}>
                    {item.validationStatus}
                  </Badge>
                ),
              },
              {
                key: "visibility",
                header: "Visibility",
                render: (item: EvidenceItem) => (
                  <span className="text-xs text-muted-foreground">
                    {item.visibility.replace(/_/g, " ")}
                  </span>
                ),
              },
            ]}
            data={evidence}
            keyExtractor={(item) => item.id}
            emptyMessage="No evidence"
          />
        )}
      </div>
    </div>
  );
}
