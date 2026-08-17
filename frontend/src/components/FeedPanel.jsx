import React from "react";
import { parseTimestamp } from "../App";

const LEVEL_STYLES = {
  GREEN: "bg-green-500/15 text-green-400 border-green-500/30",
  YELLOW: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  RED: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ALERT_LABELS = {
  crowd_surge: "Crowd Surge",
  abandoned_object: "Abandoned Object",
  wrong_way_vehicle: "Wrong-Way Vehicle",
};

function timeAgo(timestamp) {
  const diffMs = Date.now() - parseTimestamp(timestamp).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export default function FeedPanel({ camera, latestAlert, latestPollution }) {
  const isOnline = camera.status === "online";

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative">
        <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="absolute top-3 left-3 bg-black/50 text-white text-xs font-mono px-2 py-1 rounded">
          {camera.id.toUpperCase()}
        </span>
        <span className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded text-xs">
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-slate-200">{isOnline ? "LIVE" : "OFFLINE"}</span>
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-semibold">{camera.name}</h3>
            <p className="text-slate-500 text-xs">{camera.location}</p>
          </div>
          {latestPollution && (
            <span className={`text-xs font-medium px-2 py-1 rounded-md border ${LEVEL_STYLES[latestPollution.level]}`}>
              {latestPollution.level} · {latestPollution.total_co2.toFixed(1)}g
            </span>
          )}
        </div>

        {latestAlert ? (
          <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
            latestAlert.status === "new" ? "bg-orange-500/10 border border-orange-500/30" : "bg-slate-800/50 border border-slate-700"
          }`}>
            <span className={latestAlert.status === "new" ? "text-orange-400 font-medium" : "text-slate-400"}>
              {ALERT_LABELS[latestAlert.alert_type] || latestAlert.alert_type}
            </span>
            <span className="text-slate-500 text-xs">{timeAgo(latestAlert.timestamp)}</span>
          </div>
        ) : (
          <div className="text-slate-600 text-sm py-2">No recent alerts</div>
        )}
      </div>
    </div>
  );
}
