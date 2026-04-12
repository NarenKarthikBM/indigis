import { useState } from "react";
import { useStore } from "../../store";
import { BASEMAPS } from "../../store/mapSlice";

const ICONS: Record<string, string> = {
  "CartoDB Light": "☀️",
  "CartoDB Dark": "🌑",
  "OpenStreetMap": "🗺️",
  "Esri World Imagery": "🛰️",
};

const styles = `
@keyframes basemap-slide-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.basemap-menu {
  animation: basemap-slide-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.basemap-option {
  transition: background 0.12s ease, color 0.12s ease;
}

.basemap-option:hover {
  background: rgba(167, 139, 250, 0.12) !important;
  color: #A78BFA !important;
}

.basemap-toggle {
  transition: box-shadow 0.15s ease, background 0.15s ease;
}

.basemap-toggle:hover {
  background: rgba(37, 50, 68, 0.98) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px #A78BFA !important;
}
`;

export default function BasemapSwitcher() {
  const [open, setOpen] = useState(false);
  const basemap = useStore((s) => s.basemap);
  const setBasemap = useStore((s) => s.setBasemap);

  return (
    <>
      <style>{styles}</style>
      <div
        style={{
          position: "absolute",
          bottom: "2rem",
          right: "1rem",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "4px",
        }}
      >
        {open && (
          <div
            className="basemap-menu"
            style={{
              background: "rgba(21, 29, 43, 0.96)",
              border: "1px solid #3A4D62",
              borderRadius: "8px",
              overflow: "hidden",
              minWidth: "160px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {BASEMAPS.filter((b) => b.name !== basemap.name).map((b, i, arr) => (
              <button
                key={b.name}
                className="basemap-option"
                onClick={() => {
                  setBasemap(b);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "9px 12px",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderBottom: i < arr.length - 1 ? "1px solid #1e2a3a" : "none",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  color: "#8B9DB0",
                  fontFamily: "JetBrains Mono, monospace",
                  letterSpacing: "0.01em",
                }}
              >
                <span style={{ fontSize: "0.9rem" }}>{ICONS[b.name] ?? "🗺️"}</span>
                {b.name}
              </button>
            ))}
          </div>
        )}

        <button
          className="basemap-toggle"
          onClick={() => setOpen((v) => !v)}
          title="Switch basemap"
          style={{
            width: "160px",
            height: "38px",
            borderRadius: "8px",
            background: open
              ? "rgba(37, 50, 68, 0.98)"
              : "rgba(21, 29, 43, 0.92)",
            border: `1px solid ${open ? "#A78BFA" : "#3A4D62"}`,
            boxShadow: open
              ? "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px #A78BFA"
              : "0 4px 16px rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.85rem" }}>{ICONS[basemap.name] ?? "🗺️"}</span>
            <span style={{
              fontSize: "0.72rem",
              fontWeight: 500,
              color: open ? "#A78BFA" : "#CBD5E1",
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.01em",
            }}>
              {basemap.name}
            </span>
          </div>
          <span style={{
            fontSize: "0.6rem",
            color: open ? "#A78BFA" : "#3A4D62",
            transition: "transform 0.2s ease, color 0.15s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-block",
          }}>▲</span>
        </button>
      </div>
    </>
  );
}
