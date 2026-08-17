import React from "react";

const ALERT_LABELS = {
  crowd_surge: "Crowd Surge",
  abandoned_object: "Abandoned Object",
  wrong_way_vehicle: "Wrong-Way Vehicle",
};

const ALERT_ICONS = {
  crowd_surge: "👥",
  abandoned_object: "🎒",
  wrong_way_vehicle: "🚗",
};

const STATUS_STYLES = {
  new: {
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    badge: "bg-orange-500 text-white",
    label: "NEW",
  },
  acknowledged: {
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/5",
    badge: "bg-yellow-500 text-slate-900",
    label: "ACKNOWLEDGED",
  },
  resolved: {
    border: "border-green-500/40",
    bg: "bg-green-500/5",
    badge: "bg-green-500 text-slate-900",
    label: "RESOLVED",
  },
};

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AlertCard({ alert, onAcknowledge, compact = false }) {
  const style = STATUS_STYLES[alert.status] || STATUS_STYLES.new;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3 ${alert.status === "new" ? "animate-pulse-alert" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-lg leading-none">{ALERT_ICONS[alert.alert_type] || "⚠️"}</span>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {ALERT_LABELS[alert.alert_type] || alert.alert_type}
            </p>
            <p className="text-slate-400 text-xs truncate">{alert.location}</p>
          </div>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {!compact && (
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          <span>Confidence: {(alert.confidence * 100).toFixed(0)}%</span>
          {alert.count > 1 && <span>Count: {alert.count}</span>}
          <span>{formatTime(alert.timestamp)}</span>
        </div>
      )}

      {alert.status === "new" && onAcknowledge && (
        <button
          onClick={() => onAcknowledge(alert.id)}
          className="mt-2 w-full bg-slate-800 hover:bg-yellow-500 hover:text-slate-900 text-slate-200 text-xs font-medium py-1.5 rounded-md transition-colors"
        >
          Acknowledge
        </button>
      )}
    </div>
  );
}
