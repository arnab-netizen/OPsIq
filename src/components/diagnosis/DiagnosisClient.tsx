"use client";

/**
 * Consultant quick-intake diagnosis form + answer (client). Rendered by /diagnosis only when the
 * server has confirmed the actor may run it (resolveDiagnosisAccess: the same capability and plan
 * checks POST /api/diagnosis enforces), so the form is never shown to someone who cannot submit it.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Textarea, Select } from "@/ui/primitives";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";
import { httpResponseErrorFromBody, toOperatorSafeError } from "@/lib/operator-safe-errors";
import { parseOptionalFigure } from "@/domain/generic-diagnosis/form";
import type { GenericDiagnosisAnswer } from "@/domain/generic-diagnosis/answer";
import DiagnosisBetaNotice from "@/components/diagnosis/DiagnosisBetaNotice";
import { DiagnosisAnswerView } from "@/components/diagnosis/DiagnosisAnswerView";

interface DiagnosisResponse {
  engagementId: string;
  engagementCode: string;
  createdAt: string;
  input: { businessName: string };
  answer: GenericDiagnosisAnswer;
  engagement: { interventionMode: string; severity: string | null };
}

/** What was typed, kept so "Run another diagnosis" starts from it instead of an empty form. */
type FormValues = Record<"businessName" | "businessType" | "problemStatement" | "mainIssue" | "monthlyRevenue" | "monthlyCosts" | "customerCount", string>;

export default function DiagnosisClient({ canAddClients }: { canAddClients: boolean }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResponse | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const text = (name: keyof FormValues) => String(formData.get(name) ?? "");
    const typed: FormValues = {
      businessName: text("businessName"),
      businessType: text("businessType"),
      problemStatement: text("problemStatement"),
      mainIssue: text("mainIssue"),
      monthlyRevenue: text("monthlyRevenue"),
      monthlyCosts: text("monthlyCosts"),
      customerCount: text("customerCount"),
    };
    setValues(typed);

    if (!typed.mainIssue) {
      setError("Choose the main concern (or “Not sure yet”).");
      return;
    }
    const revenue = parseOptionalFigure(typed.monthlyRevenue, "Monthly revenue");
    const costs = parseOptionalFigure(typed.monthlyCosts, "Monthly costs");
    const customers = parseOptionalFigure(typed.customerCount, "Customer count", { integer: true });
    for (const parsed of [revenue, costs, customers]) {
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
    }

    const body: Record<string, unknown> = {
      businessName: typed.businessName,
      businessType: typed.businessType,
      problemStatement: typed.problemStatement,
      mainIssue: typed.mainIssue,
    };
    // Unknown figures are omitted — never sent as 0.
    if (revenue.ok && revenue.value !== undefined) body.monthlyRevenue = revenue.value;
    if (costs.ok && costs.value !== undefined) body.monthlyCosts = costs.value;
    if (customers.ok && customers.value !== undefined) body.customerCount = customers.value;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": createClientIdempotencyKey("diagnosis") },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && !canAddClients) {
        // For an actor without client-creation access the usual 403 is a business that isn't a
        // client yet; say so, without claiming it is the only possible cause.
        setError("You don't have permission to do this. If this business isn't a client yet, adding it needs client-creation access — only existing clients can be diagnosed. Check the business name, or ask an admin to add the client.");
        return;
      }
      if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
      setResult(data as DiagnosisResponse);
    } catch (err) {
      // Status-first: 403 reads as a permission problem, 400 shows the server's safe field message.
      setError(toOperatorSafeError(err, "action").error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <h1 ref={resultHeading} tabIndex={-1} className="text-3xl font-bold text-foreground mb-4 focus:outline-none">
          Diagnosis — {result.input.businessName}
        </h1>
        <div aria-live="polite">
          <DiagnosisAnswerView
            answer={result.answer}
            engagementCode={result.engagementCode}
            interventionMode={result.engagement.interventionMode}
          />
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-6">
          <Link href={`/engagements/${result.engagementId}`}>
            <Button>Open the engagement</Button>
          </Link>
          <Button variant="outline" onClick={() => { setResult(null); setError(null); }}>
            Change the details and run again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-3xl font-bold text-foreground mb-2">Quick diagnosis</h1>
      <p className="text-muted-foreground mb-6">
        Enter what the client has told you. OpsIQ answers only what these facts support, says how sure it is, and
        lists what it still needs. Each run is saved as a new draft engagement.
      </p>

      <DiagnosisBetaNotice />

      {error && (
        <div role="alert" data-testid="diagnosis-error" className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          name="businessName"
          label="Business name"
          placeholder="Acme Corp"
          required
          disabled={isSubmitting}
          defaultValue={values?.businessName}
          hint={canAddClients ? undefined : "Only businesses that are already clients in this workspace can be diagnosed — adding a new client needs client-creation access."}
        />
        <Input name="businessType" label="Business type" placeholder="e.g. Bakery, SaaS, Plumbing" required disabled={isSubmitting} defaultValue={values?.businessType} />
        <Textarea
          name="problemStatement"
          label="Problem statement"
          placeholder="The main challenge, in the client's own words"
          required
          disabled={isSubmitting}
          rows={4}
          defaultValue={values?.problemStatement}
        />
        <Select
          name="mainIssue"
          label="Main concern"
          required
          disabled={isSubmitting}
          placeholder="Choose the main concern"
          defaultValue={values?.mainIssue ?? ""}
          options={[
            { value: "low_sales", label: "Low sales" },
            { value: "high_costs", label: "High costs" },
            { value: "cash_flow", label: "Cash flow" },
            { value: "customer_retention", label: "Customers not coming back" },
            { value: "operations", label: "Operations" },
            { value: "unclear", label: "Not sure yet" },
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input name="monthlyRevenue" label="Monthly revenue (optional)" inputMode="decimal" disabled={isSubmitting} defaultValue={values?.monthlyRevenue} aria-describedby="diagnosis-figure-hint" />
          <Input name="monthlyCosts" label="Monthly costs (optional)" inputMode="decimal" disabled={isSubmitting} defaultValue={values?.monthlyCosts} aria-describedby="diagnosis-figure-hint" />
          <Input name="customerCount" label="Customers (optional)" inputMode="numeric" disabled={isSubmitting} defaultValue={values?.customerCount} aria-describedby="diagnosis-figure-hint" />
        </div>
        <p id="diagnosis-figure-hint" className="text-xs text-muted-foreground">
          Leave a figure blank if it isn&apos;t known — blank is treated as unknown, never as 0. Enter 0 only when the
          amount really is zero. Use the client&apos;s own currency.
        </p>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Running diagnosis…" : "Run diagnosis"}
        </Button>
      </form>
    </div>
  );
}
