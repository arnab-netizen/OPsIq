import { Suspense } from "react";
import { FirstRunReturnBar } from "@/components/owner/first-run/FirstRunReturnBar";

/** Owner surfaces share one thin wrapper so the first-read return bar is available wherever evidence is supplied. */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <FirstRunReturnBar />
      </Suspense>
      {children}
    </>
  );
}
