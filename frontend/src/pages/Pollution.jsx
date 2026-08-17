import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from "recharts";
import { useAlerts } from "../App";
import NagpurMap from "../components/NagpurMap";

const LEVEL_COLORS = { GREEN: "#22c55e", YELLOW: "#eab308", RED: "#ef4444" };

const LEVEL_STYLES = {
  GREEN: "bg-green-500/15 text-green-400 border-green-500/30",
  YELLOW: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  RED: "bg-red-500/15 text-red-400 border-red-500/30",
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm">
      <p className="text-white font-medium">{d.name}</p>
      <p className="text-slate-400">{d.total_co2.toFixed(1)}g CO2 · {d.level}</p>
    </div>
  );
}

export default function Pollution() {
  const { pollutionScores, cameras } = useAlerts();

  const latestByCamera = useMemo(() => {
    return cameras.map((camera) => {
      const latest = pollutionScores.find((p) => p.camera_id === camera.id);
      return {
        ...camera,
        score: latest || null,
      };
    });
  }, [cameras, pollutionScores]);

  const chartData = useMemo(
    () =>
      latestByCamera
        .filter((c) => c.score)
        .map((c) => ({
          name: c.name,
          total_co2: c.score.total_co2,
          level: c.score.level,
        })),
    [latestByCamera]
  );

  const worstJunction = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((worst, c) => (c.total_co2 > worst.total_co2 ? c : worst), chartData[0]);
  }, [chartData]);

  return (
    <div className="p-6 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white text-xl font-semibold">Pollution Index — Nagpur City</h2>
          <p className="text-slate-400 text-sm">CO2 emissions estimated from live vehicle dwell time (CPCB factors)</p>
        </div>
        {worstJunction && (
          <div className={`border rounded-lg px-4 py-2 text-right ${LEVEL_STYLES[worstJunction.level]}`}>
            <p className="text-xs uppercase tracking-wide opacity-80">Worst Junction</p>
            <p className="font-semibold">{worstJunction.name} · {worstJunction.total_co2.toFixed(1)}g</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden h-[420px]">
          <NagpurMap cameras={latestByCamera} />
        </div>

        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-4 h-[420px]">
          <h3 className="text-white font-semibold mb-4">CO2 by Junction (60s window)</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={110} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e293b" }} />
                <Bar dataKey="total_co2" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={LEVEL_COLORS[entry.level]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-600 text-sm text-center mt-16">No pollution readings yet. Waiting for first 60s window...</p>
          )}
        </div>
      </div>

      <h3 className="text-white font-semibold mb-3">Vehicle Breakdown by Junction</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {latestByCamera.map((camera) => (
          <div key={camera.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-medium">{camera.name}</h4>
              {camera.score && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${LEVEL_STYLES[camera.score.level]}`}>
                  {camera.score.level}
                </span>
              )}
            </div>

            {camera.score ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <div className="bg-slate-800/50 rounded-md py-2">
                    <p className="text-lg font-bold text-white">{camera.score.cars}</p>
                    <p className="text-[10px] text-slate-400">Cars</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-md py-2">
                    <p className="text-lg font-bold text-white">{camera.score.trucks}</p>
                    <p className="text-[10px] text-slate-400">Trucks/Bus</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-md py-2">
                    <p className="text-lg font-bold text-white">{camera.score.motorcycles}</p>
                    <p className="text-[10px] text-slate-400">Bikes</p>
                  </div>
                </div>
                <p className="text-center text-slate-300 text-sm">
                  Total CO2: <span className="text-white font-semibold">{camera.score.total_co2.toFixed(1)}g</span>
                </p>
              </>
            ) : (
              <p className="text-slate-600 text-sm text-center py-6">No data yet</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
