"use client";

import { useEffect, useState } from "react";
import { OperatorItem as OperatorItemComponent } from "@/components/OperatorItem";

interface OperatorItem {
  id: string;
  problem: string;
  action: string;
  impactExpected: number;
  confidence: number;
  priorityScore: number;
  status: "pending" | "in_progress" | "done";
}

export default function MyDayPage() {
  const [items, setItems] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch("/api/operator");
        if (!response.ok) {
          throw new Error("Failed to fetch items");
        }
        const data = await response.json();
        setItems(data.slice(0, 3));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const handleItemUpdate = (updatedItem: OperatorItem) => {
    setItems(
      items.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px" }}>
      <h1>My Day</h1>

      {loading && <p>Loading...</p>}

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

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {items.map((item) => (
          <OperatorItemComponent
            key={item.id}
            item={item}
            onUpdate={handleItemUpdate}
          />
        ))}
      </div>

      {!loading && items.length === 0 && (
        <p style={{ color: "#999" }}>No items for today</p>
      )}
    </div>
  );
}
