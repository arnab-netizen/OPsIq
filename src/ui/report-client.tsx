"use client";

import { Button } from "@/ui/primitives";
import { useState } from "react";

interface Report {
  summary: {
    engagementId: string;
    engagementCode: string;
    engagementTitle: string;
    status: string;
    healthStatus: string;
    interventionMode: string;
    currentCondition?: {
      businessStatus: string;
      severityScore: number;
      assessedAt: string;
    };
  };
  findings: Array<any>;
  recommendations: Array<any>;
  actions: Array<any>;
  kpis: Array<any>;
  reviewStatus: any;
  metadata: {
    generatedAt: string;
    version: string;
    dataCompleteness: any;
  };
}

export function ReportClient({ report, engagementId }: { report: Report; engagementId: string }) {
  const [isPrinting, setIsPrinting] = useState(false);

  function downloadJSON() {
    const filename = `${report.summary.engagementCode}-report-${new Date().toISOString().split("T")[0]}.json`;
    const dataStr = JSON.stringify(report, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function printReport() {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={downloadJSON}>
        Download JSON
      </Button>
      <Button size="sm" variant="outline" onClick={printReport} disabled={isPrinting}>
        {isPrinting ? "Preparing..." : "Print"}
      </Button>
    </div>
  );
}
