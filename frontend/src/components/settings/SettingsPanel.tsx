import { useStore } from "../../store";
import DisplayAccordion from "./DisplayAccordion";

export default function SettingsPanel() {
  const { settingsPanelLayer, closeSettings, availableLayers } = useStore((s) => ({
    settingsPanelLayer: s.settingsPanelLayer,
    closeSettings: s.closeSettings,
    availableLayers: s.availableLayers,
  }));

  const layer = availableLayers.find((l) => l.slug === settingsPanelLayer);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1a2535",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #253244",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          onClick={closeSettings}
          style={{
            background: "none",
            border: "none",
            color: "#8B9DB0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: "2px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <div>
          <div
            style={{
              fontSize: "10px",
              color: "#8B9DB0",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Layer Settings
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#E8EDF2" }}>
            {layer?.label || settingsPanelLayer}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {settingsPanelLayer && <DisplayAccordion slug={settingsPanelLayer} />}
      </div>
    </div>
  );
}
