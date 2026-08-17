import React, { useMemo } from "react";
import { useAlerts } from "../App";
import FeedPanel from "../components/FeedPanel";
import AlertSidebar from "../components/AlertSidebar";

export default function Dashboard() {
  const { alerts, pollutionScores, cameras, acknowledgeAlert } = useAlerts();

  const activeAlertCount = useMemo(
    () => alerts.filter((a) => a.status === "new").length,
    [alerts]
  );

  const latestByCamera = useMemo(() => {
    const map = {};
    for (const camera of cameras) {
      map[camera.id] = {
        alert: alerts.find((a) => a.camera_id === camera.id),
        pollution: pollutionScores.find((p) => p.camera_id === camera.id),
      };
    }
    return map;
  }, [cameras, alerts, pollutionScores]);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-white text-xl font-semibold">Live Operations Dashboard</h2>
            <p className="text-slate-400 text-sm">Real-time feed status across Nagpur junctions</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2 text-center">
              <p className="text-2xl font-bold text-white">{cameras.length}</p>
              <p className="text-xs text-slate-400">Cameras Online</p>
            </div>
            <div className="bg-slate-900/60 border border-orange-500/30 rounded-lg px-4 py-2 text-center">
              <p className="text-2xl font-bold text-orange-500">{activeAlertCount}</p>
              <p className="text-xs text-slate-400">Active Alerts</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cameras.map((camera) => (
            <FeedPanel
              key={camera.id}
              camera={camera}
              latestAlert={latestByCamera[camera.id]?.alert}
              latestPollution={latestByCamera[camera.id]?.pollution}
            />
          ))}
        </div>

        {cameras.length === 0 && (
          <div className="text-center text-slate-500 mt-16">
            No cameras registered yet. Waiting for backend data...
          </div>
        )}
      </div>

      <AlertSidebar alerts={alerts} onAcknowledge={acknowledgeAlert} />
    </div>
  );
}
