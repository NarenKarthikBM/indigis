import { Popup } from "react-leaflet";
import { useStore } from "../../store";

export default function RegionPopup() {
  const { activeRegion, setActiveRegion } = useStore((s) => ({
    activeRegion: s.activeRegion,
    setActiveRegion: s.setActiveRegion,
  }));

  if (!activeRegion) return null;

  const { name, type, code, area_km2, state_name, latlng } = activeRegion;

  return (
    <Popup
      key={`${code}-${latlng.lat}-${latlng.lng}`}
      position={[latlng.lat, latlng.lng]}
      onClose={() => setActiveRegion(null)}
      closeButton
    >
      <div
        style={{
          minWidth: "180px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div
          style={{
            borderBottom: "2px solid #8B5CF6",
            paddingBottom: "6px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "#A78BFA",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "2px",
            }}
          >
            {type}
          </div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#E8EDF2" }}>
            {name}
          </div>
          {state_name && (
            <div style={{ fontSize: "12px", color: "#8B9DB0" }}>{state_name}</div>
          )}
        </div>

        {area_km2 != null && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ color: "#8B9DB0" }}>Area</span>
            <span style={{ color: "#E8EDF2", fontFamily: "JetBrains Mono, monospace" }}>
              {area_km2.toLocaleString("en-IN")} km²
            </span>
          </div>
        )}
      </div>
    </Popup>
  );
}
