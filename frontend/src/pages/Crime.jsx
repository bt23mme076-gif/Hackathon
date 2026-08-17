import React, { useMemo, useState } from "react";
import { useAlerts, parseTimestamp } from "../App";

const ALERT_LABELS = {
  crowd_surge: "Crowd Surge",
  abandoned_object: "Abandoned Object",
  wrong_way_vehicle: "Wrong-Way Vehicle",
};

const STATUS_BADGE = {
  new: "bg-orange-500 text-white",
  acknowledged: "bg-yellow-500 text-slate-900",
  resolved: "bg-green-500 text-slate-900",
};

const ROW_BORDER = {
  new: "border-l-orange-500",
  acknowledged: "border-l-yellow-500",
  resolved: "border-l-green-500",
};

function formatDateTime(timestamp) {
  return parseTimestamp(timestamp).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Crime() {
  const { alerts, cameras, acknowledgeAlert } = useAlerts();
  const [cameraFilter, setCameraFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (cameraFilter !== "all" && a.camera_id !== cameraFilter) return false;
      if (typeFilter !== "all" && a.alert_type !== typeFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      return true;
    });
  }, [alerts, cameraFilter, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const byType = {};
    for (const a of alerts) byType[a.alert_type] = (byType[a.alert_type] || 0) + 1;
    return byType;
  }, [alerts]);

  const selectClass =
    "bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500";

  return (
    <div className="p-6 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white text-xl font-semibold">Crime Detection — Alert History</h2>
          <p className="text-slate-400 text-sm">{alerts.length} total alerts recorded</p>
        </div>
        <div className="flex gap-3">
          {Object.entries(ALERT_LABELS).map(([key, label]) => (
            <div key={key} className="bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2 text-center">
              <p className="text-xl font-bold text-white">{stats[key] || 0}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select className={selectClass} value={cameraFilter} onChange={(e) => setCameraFilter(e.target.value)}>
          <option value="all">All Cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className={selectClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(ALERT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-left">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Alert Type</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Count</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((alert) => (
              <tr key={alert.id} className={`border-b border-slate-800/50 border-l-4 ${ROW_BORDER[alert.status]} hover:bg-slate-800/30`}>
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDateTime(alert.timestamp)}</td>
                <td className="px-4 py-3 text-slate-300">{alert.location}</td>
                <td className="px-4 py-3 text-white font-medium">{ALERT_LABELS[alert.alert_type] || alert.alert_type}</td>
                <td className="px-4 py-3 text-slate-300">{(alert.confidence * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-slate-300">{alert.count}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_BADGE[alert.status]}`}>
                    {alert.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {alert.status === "new" ? (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="text-xs bg-slate-800 hover:bg-yellow-500 hover:text-slate-900 text-slate-200 font-medium px-3 py-1 rounded-md transition-colors"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-slate-600 text-sm text-center py-10">No alerts match the current filters.</p>
        )}
      </div>
    </div>
  );
}
