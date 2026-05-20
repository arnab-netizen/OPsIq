"use client";
import { classifyOperatorError, type ErrorGovernanceContext } from "@/lib/operator-error-governance";

import { useState } from "react";

interface BulkCreateResult {
  successful: any[];
  failed: Array<{ title: string; reason: string }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

interface DecisionCSVUploadProps {
  workspaceId: string;
  onSuccess?: (result: BulkCreateResult) => void;
  onError?: (error: string) => void;
}

export function DecisionCSVUpload({
  workspaceId,
  onSuccess,
  onError,
}: DecisionCSVUploadProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">(
    ""
  );
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      const errorMsg = "Please select a CSV file";
      setMessageType("error");
      setMessage(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/decisions/create", {
        method: "POST",
        headers: {
          "x-workspace-id": workspaceId,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Upload failed");
      }

      const data = await response.json();
      setResult(data);
      setMessageType("success");
      setMessage(
        `Successfully created ${data.summary.succeeded} decision(s)${
          data.summary.failed > 0 ? ` (${data.summary.failed} failed)` : ""
        }`
      );

      if (onSuccess) {
        onSuccess(data);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setMessageType("error");
      setMessage(errorMsg);

      if (onError) {
        onError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        }`}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          disabled={loading}
          className="hidden"
          id="csv-input"
        />
        <label
          htmlFor="csv-input"
          className="cursor-pointer flex flex-col items-center"
        >
          <div className="text-2xl mb-2">📁</div>
          <p className="text-sm font-medium text-gray-700">
            Drag CSV file here or click to select
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Required columns: title, type, impact, confidence
          </p>
        </label>
      </div>

      <div className="bg-gray-50 p-3 rounded-md">
        <p className="text-xs text-gray-600 font-mono">
          Example CSV format:
        </p>
        <pre className="text-xs text-gray-600 font-mono mt-2 overflow-x-auto">
{`title,type,impact,confidence
Revenue Optimization,strategic,100000,0.85
Cost Reduction,operational,50000,0.75`}
        </pre>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            messageType === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      {result && result.summary.failed > 0 && (
        <div className="border border-yellow-200 bg-yellow-50 p-3 rounded-md">
          <p className="text-sm font-medium text-yellow-800 mb-2">
            {result.summary.failed} decision(s) failed:
          </p>
          <ul className="text-xs text-yellow-700 space-y-1">
            {result.failed.map((item, idx) => (
              <li key={idx} className="truncate">
                <strong>{item.title}:</strong> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="text-sm text-gray-600 mt-2">Uploading...</p>
        </div>
      )}
    </div>
  );
}
