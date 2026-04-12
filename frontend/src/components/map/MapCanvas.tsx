import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useStore } from "../../store";
import MapController from "./MapController";
import BoundaryLayer from "./BoundaryLayer";
import OverlayTileLayer from "./OverlayTileLayer";
import Legend from "./Legend";
import RegionPopup from "./RegionPopup";
import BasemapSwitcher from "./BasemapSwitcher";

function BoundaryToggleButton() {
  const { boundariesVisible, toggleBoundaries } = useStore((s) => ({
    boundariesVisible: s.boundariesVisible,
    toggleBoundaries: s.toggleBoundaries,
  }));

  return (
    <button
      onClick={toggleBoundaries}
      title={boundariesVisible ? "Hide boundaries" : "Show boundaries"}
      style={{
        position: "absolute",
        bottom: "24px",
        left: "16px",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: boundariesVisible ? "#8B5CF6" : "rgba(21,29,43,0.92)",
        border: `1px solid ${boundariesVisible ? "#8B5CF6" : "#3A4D62"}`,
        borderRadius: "8px",
        padding: "7px 12px",
        color: boundariesVisible ? "#fff" : "#8b9db0",
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        backdropFilter: "blur(4px)",
        transition: "background 0.2s, color 0.2s, border-color 0.2s",
      }}
    >
      {/* Boundary/polygon icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      </svg>
      Boundaries
    </button>
  );
}

const indiaBounds: [[number, number], [number, number]] = [
  [3, 62], // Southwest (Lat, Lon)
  [39, 100],  // Northeast (Lat, Lon)
];

export default function MapCanvas() {
  const basemap = useStore((s) => s.basemap);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
      maxBounds={indiaBounds}
      maxBoundsViscosity={1.0}
    >

      
      {/* CartoDB Dark Matter basemap */}
      {/* <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
        minZoom={5}
      /> */}

      {/* <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
        minZoom={5}
      /> */}


        {/* <TileLayer
        attribution='&copy; Esri'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
          minZoom={5}
      /> */}

      <TileLayer
          url={basemap.url}
          attribution={basemap.attribution}
          subdomains={basemap.subdomains ?? "abc"}
          maxZoom={19}
          minZoom={5}
        />
      <MapController />
      <BoundaryLayer />
      <OverlayTileLayer />
      {/* <RegionPopup /> */}
      <Legend />
    </MapContainer>
    <BasemapSwitcher />
    <BoundaryToggleButton />
    </div>
  );
}
