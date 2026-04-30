"use client";

import { useState, useEffect } from "react";

interface Alert {
  id: string;
  type: "blocked" | "threshold_breach" | "execution_failure";
  channel: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
}

interface AlertsPanelProps {
  alerts: Alert[];
  onMarkAsRead?: (alertId: string) => void;
  onClose?: (alertId: string) => void;
  maxVisible?: number;
}

export function AlertsPanel({
  alerts,
  onMarkAsRead,
  onClose,
  maxVisible = 5,
}: AlertsPanelProps) {
  const [visible, setVisible] = useState(alerts.slice(0, maxVisible));

  useEffect(() => {
    setVisible(alerts.slice(0, maxVisible));
  }, [alerts, maxVisible]);

  const getAlertIcon = (type: Alert["type"]) => {
    switch (type) {
      case "blocked":
        return "🚫";
      case "threshold_breach":
        return "⚠️";
      case "execution_failure":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  const getAlertStyle = (type: Alert["type"]) => {
    switch (type) {
      case "blocked":
        return "border-l-4 border-red-500 bg-red-50";
      case "threshold_breach":
        return "border-l-4 border-yellow-500 bg-yellow-50";
      case "execution_failure":
        return "border-l-4 border-orange-500 bg-orange-50";
      default:
        return "border-l-4 border-gray-500 bg-gray-50";
    }
  };

  const handleMarkAsRead = (alertId: string) => {
    if (onMarkAsRead) {
      onMarkAsRead(alertId);
    }
  };

  const handleClose = (alertId: string) => {
    setVisible(visible.filter((a) => a.id !== alertId));
    if (onClose) {
      onClose(alertId);
    }
  };

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md space-y-2 z-50">
      {visible.map((alert) => (
        <div
          key={alert.id}
          className={`p-4 rounded-lg shadow-lg ${getAlertStyle(
            alert.type
          )} ${!alert.isRead ? "ring-2 ring-blue-400" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-lg">
              {getAlertIcon(alert.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {alert.message}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(alert.createdAt).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={() => handleClose(alert.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 font-bold text-lg"
              aria-label="Close alert"
            >
              ×
            </button>
          </div>
          {!alert.isRead && (
            <button
              onClick={() => handleMarkAsRead(alert.id)}
              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Mark as read
            </button>
          )}
        </div>
      ))}
      {alerts.length > maxVisible && (
        <div className="text-xs text-gray-500 text-center">
          +{alerts.length - maxVisible} more alerts
        </div>
      )}
    </div>
  );
}
