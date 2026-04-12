import { useStore } from "../../store";
import LayerPanel from "../sidebar/LayerPanel";
import ActiveLayersPanel from "../sidebar/ActiveLayersPanel";
import SettingsPanel from "../settings/SettingsPanel";

function AboutPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a2535" }}>
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #253244" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#8B5CF6",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          About
        </div>
      </div>
      <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#E8EDF2", marginBottom: "4px" }}>
            <span style={{ color: "#60A5FA" }}>Indi</span>
            <span style={{ color: "#8B5CF6" }}>GIS</span>
          </div>
          <div style={{ fontSize: "11px", color: "#5A6A7A" }}>Geospatial Platform for India</div>
        </div>
        <div style={{ fontSize: "12px", color: "#8B9DB0", lineHeight: "1.6" }}>
          IndiGIS provides interactive geospatial data visualization for India. Explore administrative boundaries,
          land cover, terrain and much more.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {[
            { label: "Map Engine", value: "Leaflet + TiTiler" },
            { label: "Backend", value: "Django / PostGIS" },
            { label: "Data", value: "Satellite & Survey" },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: "#212D3F",
                borderRadius: "6px",
                border: "1px solid #253244",
              }}
            >
              <span style={{ fontSize: "11px", color: "#5A6A7A" }}>{label}</span>
              <span style={{ fontSize: "11px", color: "#8B9DB0", fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { activeNavSection, settingsPanelLayer } = useStore((s) => ({
    activeNavSection: s.activeNavSection,
    settingsPanelLayer: s.settingsPanelLayer,
  }));

  const renderContent = () => {
    if (settingsPanelLayer) return <SettingsPanel />;
    if (activeNavSection === "about") return <AboutPanel />;
    if (activeNavSection === "active-layers") return <ActiveLayersPanel />;
    if (activeNavSection === "community-overlays") return <LayerPanel overlayType="community" />;
    return <LayerPanel overlayType="core" />;
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#1a2535",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {renderContent()}
    </div>
  );
}
