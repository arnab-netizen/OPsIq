"use client";

/**
 * "Plan a new business" — the entry point into Startup Mode for an owner who already runs an
 * established business. Deliberately secondary and NOT on Home: a real usability test found a
 * prominent "Switch to Startup Mode" button on Home confusing for an owner who already has a real
 * business set up, with no explanation of what it does to their current view. Confirmation
 * explains Startup Mode is a separate planning space and offers an explicit way back before
 * navigating anywhere.
 */

import { useState } from "react";
import { Button, Modal } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";

export function PlanNewBusinessLink() {
  const { activeBusiness } = useActiveBusiness();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        data-testid="plan-new-business-link"
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="text-muted-foreground"
      >
        Plan a new business
      </Button>
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Plan a new business"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              {activeBusiness?.name ? `← Back to ${activeBusiness.name}` : "← Back"}
            </Button>
            <Button
              data-testid="plan-new-business-confirm"
              size="sm"
              onClick={() => { window.location.href = "/owner/startup"; }}
            >
              Continue to Starting up
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          Startup planning is separate from {activeBusiness?.name ?? "your current business"}.
          Your current business will not be changed.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Use this if you&apos;re thinking about starting a brand-new business. You can always come
          back to {activeBusiness?.name ?? "your current business"} exactly as you left it.
        </p>
      </Modal>
    </>
  );
}
