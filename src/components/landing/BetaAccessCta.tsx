"use client";

/**
 * The homepage's public cold-traffic beta-access entry point.
 *
 * Renders as a trigger (styled by the caller via `triggerClassName` to match
 * whichever spot on the landing page it appears — header nav link, hero
 * button, or final-CTA button) that opens the shared, accessible `Modal`
 * primitive containing a lightweight capture form (email required, first
 * name optional). This is the only client-side island on an otherwise
 * server-rendered landing page — see LandingPage.tsx.
 *
 * Business logic (persistence, rate limiting, deduplication, audit) all
 * lives server-side in POST /api/beta-requests; this component only
 * collects input, shows state, and reports the server's own response
 * copy — it never decides success/failure itself.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal, Input, Button } from "@/ui/primitives";

interface BetaAccessCtaProps {
  triggerClassName: string;
  triggerLabel?: string;
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const DEFAULT_LABEL = "Request beta access";

const DEFAULT_SUCCESS_MESSAGE =
  "Your beta request has been received. We're opening access gradually, so immediate access isn't guaranteed — we'll follow up by email if you're selected.";

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function BetaAccessCta({ triggerClassName, triggerLabel = DEFAULT_LABEL }: BetaAccessCtaProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const utmRef = useRef<{ source?: string; medium?: string; campaign?: string; content?: string }>({});

  // Read UTM params once, client-side only — never via next/navigation's
  // useSearchParams, so this component carries no Suspense-boundary
  // requirement and does no server-side work of its own.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    utmRef.current = {
      source: params.get("utm_source") ?? undefined,
      medium: params.get("utm_medium") ?? undefined,
      campaign: params.get("utm_campaign") ?? undefined,
      content: params.get("utm_content") ?? undefined,
    };
  }, []);

  function resetAndClose() {
    setIsOpen(false);
    setEmail("");
    setFirstName("");
    setStatus("idle");
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return; // double-submit protection

    setStatus("submitting");
    setMessage(null);

    try {
      const res = await fetch("/api/beta-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
          ...(utmRef.current.source ? { utmSource: utmRef.current.source } : {}),
          ...(utmRef.current.medium ? { utmMedium: utmRef.current.medium } : {}),
          ...(utmRef.current.campaign ? { utmCampaign: utmRef.current.campaign } : {}),
          ...(utmRef.current.content ? { utmContent: utmRef.current.content } : {}),
        }),
      });
      const body = await res.json().catch(() => null);

      if (res.ok && body?.success) {
        setStatus("success");
        setMessage(typeof body.message === "string" ? body.message : DEFAULT_SUCCESS_MESSAGE);
      } else {
        setStatus("error");
        setMessage(typeof body?.error === "string" ? body.error : DEFAULT_ERROR_MESSAGE);
      }
    } catch {
      setStatus("error");
      setMessage(DEFAULT_ERROR_MESSAGE);
    }
  }

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setIsOpen(true)}>
        {triggerLabel}
      </button>

      <Modal isOpen={isOpen} onClose={resetAndClose} title="Request beta access">
        {status === "success" ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-sm text-foreground">
              {message ?? DEFAULT_SUCCESS_MESSAGE}
            </p>
            <Button type="button" variant="outline" onClick={resetAndClose} className="self-end">
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              OpsIQ is in a controlled, invite-only beta. Tell us where to reach you and we&rsquo;ll follow up as access opens.
            </p>
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
            />
            <Input
              label="First name (optional)"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={status === "submitting"}
            />
            {status === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {message ?? DEFAULT_ERROR_MESSAGE}
              </p>
            )}
            <Button type="submit" isLoading={status === "submitting"} className="w-full">
              Request beta access
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
