// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Badge, Table, LoadingState, ErrorState } from "@/ui/primitives";
import { AddEvidenceToBundleForm } from "./add-evidence-form";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface BundleDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  items: Array<{
    evidenceItem: {
      id: string;
      title: string;
      category: string;
      validationStatus: string;
      visibility: string;
    };
  }>;
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

export default function BundleDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string; bundleId: string }>;
}) {
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<BundleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    params.then((p) => {
      setEngagementId(p.engagementId);
      setBundleId(p.bundleId);
    });
  }, [params]);

  useEffect(() => {
    if (!bundleId) return;

    async function fetchBundle() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/evidence-bundles/${bundleId}`);
        if (!res.ok) {
          throw new Error("Failed to load bundle");
        }
        const data = await res.json();
        setBundle(data);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'load' });
        setError(governed.operatorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBundle();
  }, [bundleId]);

  function handleEvidenceAdded() {
    setShowAddForm(false);
    // Refetch bundle
    if (bundleId) {
      fetch(`/api/evidence-bundles/${bundleId}`)
        .then((res) => res.json())
        .then((data) => setBundle(data))
        .catch(() => {});
    }
  }

  function handleRemoveEvidence(evidenceId: string) {
    if (!bundleId) return;

    fetch(`/api/evidence-bundles/${bundleId}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId, evidenceItemId: evidenceId }),
    })
      .then((res) => {
        if (res.ok) {
          // Update local state
          if (bundle) {
            setBundle({
              ...bundle,
              items: bundle.items.filter(
                (item) => item.evidenceItem.id !== evidenceId
              ),
            });
          }
        }
      })
      .catch(() => {});
  }

  if (!engagementId || !bundleId) {
    return <LoadingState />;
  }

  if (isLoading) {
    return <LoadingState message="Loading bundle..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load bundle"
        message={error}
      />
    );
  }

  if (!bundle) {
    return (
      <ErrorState
        title="Bundle not found"
        message="The bundle you're looking for doesn't exist."
      />
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground overflow-auto">
        <Link href="/engagements" className="hover:text-foreground whitespace-nowrap">
          Engagements
        </Link>
        <span>/</span>
        <Link
          href={`/engagements/${engagementId}`}
          className="hover:text-foreground whitespace-nowrap"
        >
          Details
        </Link>
        <span>/</span>
        <Link
          href={`/engagements/${engagementId}/evidence`}
          className="hover:text-foreground whitespace-nowrap"
        >
          Evidence
        </Link>
        <span>/</span>
        <Link
          href={`/engagements/${engagementId}/evidence/bundles`}
          className="hover:text-foreground whitespace-nowrap"
        >
          Bundles
        </Link>
        <span>/</span>
        <span className="text-foreground truncate">{bundle.title}</span>
      </div>

      {/* Header */}
      <div className="mt-6 rounded-lg border border-border bg-muted/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">
              {bundle.title}
            </h1>
            {bundle.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {bundle.description}
              </p>
            )}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                {bundle.items.length} item{bundle.items.length !== 1 ? "s" : ""}
              </span>
              <Badge variant="outline" className="capitalize">
                {bundle.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Add Evidence Form */}
      {showAddForm && (
        <AddEvidenceToBundleForm
          bundleId={bundleId}
          engagementId={engagementId}
          onSuccess={handleEvidenceAdded}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Evidence Table */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Evidence Items
          </h2>
          <Button onClick={() => setShowAddForm(true)} size="sm">
            Add Evidence
          </Button>
        </div>

        {bundle.items.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 px-6 text-center">
            <div>
              <p className="text-sm font-medium text-foreground">
                No evidence in this bundle
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add evidence to organize and review together.
              </p>
              <Button
                onClick={() => setShowAddForm(true)}
                size="sm"
                className="mt-4"
              >
                Add Evidence
              </Button>
            </div>
          </div>
        ) : (
          <Table
            columns={[
              {
                key: "title",
                header: "Title",
                render: (item: unknown) => (
                  <Link
                    href={`/engagements/${engagementId}/evidence/${item.evidenceItem.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {item.evidenceItem.title}
                  </Link>
                ),
              },
              {
                key: "category",
                header: "Category",
                render: (item: unknown) => (
                  <Badge
                    variant={
                      CATEGORY_COLORS[item.evidenceItem.category] ?? "muted"
                    }
                  >
                    {item.evidenceItem.category}
                  </Badge>
                ),
              },
              {
                key: "validationStatus",
                header: "Status",
                render: (item: unknown) => (
                  <Badge
                    variant={
                      VALIDATION_COLORS[item.evidenceItem.validationStatus] ??
                      "muted"
                    }
                  >
                    {item.evidenceItem.validationStatus}
                  </Badge>
                ),
              },
              {
                key: "visibility",
                header: "Visibility",
                render: (item: unknown) => (
                  <span className="text-xs text-muted-foreground">
                    {item.evidenceItem.visibility.replace(/_/g, " ")}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                render: (item: unknown) => (
                  <button
                    onClick={() => handleRemoveEvidence(item.evidenceItem.id)}
                    className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                  >
                    Remove
                  </button>
                ),
              },
            ]}
            data={bundle.items}
            keyExtractor={(item) => item.evidenceItem.id}
            emptyMessage="No evidence"
          />
        )}
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          onClick={() => window.history.back()}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
