"use client";

import { useEffect, useState } from "react";
import { COMMERCIAL_DENIED_EVENT } from "@/domain/commercial/commercial-denial";
import { UpgradeRequiredNotice } from "./UpgradeRequiredNotice";

/** Listens for the server's commercial denial (402) raised by the shared mutation hook. Renders nothing otherwise. */
export function CommercialGateHost() {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    const onDenied = () => setDenied(true);
    window.addEventListener(COMMERCIAL_DENIED_EVENT, onDenied);
    return () => window.removeEventListener(COMMERCIAL_DENIED_EVENT, onDenied);
  }, []);
  if (!denied) return null;
  return <UpgradeRequiredNotice onDismiss={() => setDenied(false)} />;
}
