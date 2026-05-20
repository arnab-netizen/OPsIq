"use client";

import { useEffect, useState } from "react";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

interface Entity {
  id: string;
  name: string;
  type: "business_unit" | "client" | "project";
  createdAt: string;
}

export default function EntityPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const response = await fetch("/api/entity");
        if (!response.ok) {
          throw new Error("Failed to fetch entities");
        }
        const data = await response.json();
        setEntities(data);
      } catch (err) {
        setError(toOperatorSafeError(err, "load").error);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, []);

  const getTypeColor = (type: string): string => {
    switch (type) {
      case "business_unit":
        return "#007bff";
      case "client":
        return "#28a745";
      case "project":
        return "#ffc107";
      default:
        return "#999";
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px" }}>
      <h1>Entities</h1>

      {loading && <p>Loading entities...</p>}

      {error && (
        <div
          style={{
            color: "#d32f2f",
            backgroundColor: "#ffebee",
            padding: "12px",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          Error: {error}
        </div>
      )}

      {!loading && entities.length === 0 && (
        <p style={{ color: "#999" }}>No entities found</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {entities.map((entity) => (
          <div
            key={entity.id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              borderRadius: "4px",
              backgroundColor: "#fafafa",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 8px 0" }}>{entity.name}</h3>
              <p style={{ margin: "0", color: "#666", fontSize: "14px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
                    borderRadius: "3px",
                    backgroundColor: getTypeColor(entity.type),
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                >
                  {entity.type.replace("_", " ")}
                </span>
              </p>
            </div>
            <div style={{ textAlign: "right", color: "#999", fontSize: "12px" }}>
              {new Date(entity.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
