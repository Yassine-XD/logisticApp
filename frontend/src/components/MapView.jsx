import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

function ClickPicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick?.({ lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) });
    },
  });
  return null;
}

// Numbered stop marker
function numberIcon(n, color) {
  return L.divIcon({
    className: "",
    html: `<div class="stop-marker" style="background:${color}">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}
function depotIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="stop-marker" style="background:#0f172a;border-radius:6px">◆</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length) {
      try {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      } catch {
        /* ignore */
      }
    }
  }, [JSON.stringify(bounds)]);
  return null;
}

/**
 * points: [{ lat, lng, color, label, seq, popup }]
 * routes: [{ color, coords: [[lat,lng],...] }]
 * depot:  { lat, lng }
 */
export default function MapView({ points = [], routes = [], depot, height = 460, numbered = false, onPick }) {
  const center = depot || points[0] || { lat: 41.723, lng: 1.8266 };

  const bounds = useMemo(() => {
    const pts = [...points.map((p) => [p.lat, p.lng])];
    if (depot) pts.push([depot.lat, depot.lng]);
    routes.forEach((r) => r.coords.forEach((c) => pts.push(c)));
    return pts.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  }, [points, routes, depot]);

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={11} style={{ height, width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds bounds={bounds} />
      {onPick && <ClickPicker onPick={onPick} />}

      {routes.map((r, i) => (
        <Polyline key={`r${i}`} positions={r.coords} pathOptions={{ color: r.color, weight: 4, opacity: 0.75 }} />
      ))}

      {depot && (
        <Marker position={[depot.lat, depot.lng]} icon={depotIcon()}>
          <Popup>Depósito</Popup>
        </Marker>
      )}

      {points.map((p, i) =>
        numbered ? (
          <Marker key={i} position={[p.lat, p.lng]} icon={numberIcon(p.seq ?? i + 1, p.color || "#2563eb")}>
            {p.popup && <Popup>{p.popup}</Popup>}
          </Marker>
        ) : (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={7}
            pathOptions={{ color: "#fff", weight: 2, fillColor: p.color || "#2563eb", fillOpacity: 0.9 }}
          >
            {p.popup && <Popup>{p.popup}</Popup>}
          </CircleMarker>
        )
      )}
    </MapContainer>
  );
}
