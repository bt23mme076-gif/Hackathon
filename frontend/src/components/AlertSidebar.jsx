import React, { useState, useMemo } from "react";
import AlertCard from "./AlertCard";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "acknowledged", label: "Acked" },
];

export default function AlertSidebar({ alerts, onAcknowledge }) {
  const [filter, setFilter] = useState("all");

  const filteredAlerts = useMemo(() => {
    if (filter === "all") return alerts;
    return alerts.filter((a) => a.status === filter);
  }, [alerts, filter]);

  const newCount = alerts.filter((a) => a.status === "new").length;

  return (
    <aside className="w-96 shrink-0 bg-slate-950/60 border-l border-slate-800 flex flex-col h-full">
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Live Alerts</h2>
          {newCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {newCount} new
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                filter === f.key
                  ? "bg-orange-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredAlerts.length === 0 && (
          <p className="text-slate-600 text-sm text-center mt-8">No alerts to show.</p>
        )}
        {filteredAlerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} onAcknowledge={onAcknowledge} />
        ))}
      </div>
    </aside>
  );
}
