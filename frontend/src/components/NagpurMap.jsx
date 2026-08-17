import React from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

const NAGPUR_CENTER = [21.1458, 79.0882];

const LEVEL_COLORS = { GREEN: "#22c55e", YELLOW: "#eab308", RED: "#ef4444" };
const DEFAULT_COLOR = "#64748b";

export default function NagpurMap({ cameras = [] }) {
  return (
    <MapContainer
      center={NAGPUR_CENTER}
      zoom={12}
      scrollWheelZoom={true}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {cameras.map((camera) => {
        const level = camera.score?.level;
        const color = LEVEL_COLORS[level] || DEFAULT_COLOR;

        return (
          <CircleMarker
            key={camera.id}
            center={[camera.lat, camera.lng]}
            radius={14}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.45,
              weight: 2,
            }}
          >
            <Popup>
              <div>
                <p className="font-semibold m-0">{camera.name}</p>
                {camera.score ? (
                  <>
                    <p className="m-0 text-sm">{camera.score.level} · {camera.score.total_co2.toFixed(1)}g CO2</p>
                    <p className="m-0 text-xs">
                      {camera.score.cars} cars · {camera.score.trucks} trucks/bus · {camera.score.motorcycles} bikes
                    </p>
                  </>
                ) : (
                  <p className="m-0 text-sm">No pollution data yet</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
