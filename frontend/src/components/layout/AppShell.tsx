import { useEffect } from "react";
import { useStore } from "../../store";
import { fetchLayers } from "../../api/layers";
import TopBar from "./TopBar";
import NavRail from "./NavRail";
import Sidebar from "./Sidebar";
import MapCanvas from "../map/MapCanvas";
import LayerInfoModal from "../settings/LayerInfoModal";

export default function AppShell() {
  const { sidebarOpen, setAvailableLayers } = useStore((s) => ({
    sidebarOpen: s.sidebarOpen,
    setAvailableLayers: s.setAvailableLayers,
  }));

  useEffect(() => {
    fetchLayers()
      .then(setAvailableLayers)
      .catch(console.error);
  }, [setAvailableLayers]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "72px 1fr",
        gridTemplateColumns: `72px ${sidebarOpen ? "320px" : "0"} 1fr`,
        height: "100vh",
        overflow: "hidden",
        background: "#0e1117",
        transition: "grid-template-columns 0.2s ease",
      }}
    >
      {/* TopBar spans full width */}
      <div style={{ gridColumn: "1 / -1", gridRow: "1" }}>
        <TopBar />
      </div>

      {/* Nav Rail */}
      <div style={{ gridRow: "2", gridColumn: "1", overflow: "hidden" }}>
        <NavRail />
      </div>

      {/* Content Sidebar */}
      <div
        style={{
          gridRow: "2",
          gridColumn: "2",
          overflow: "hidden",
          borderRight: "1px solid #253244",
        }}
      >
        <Sidebar />
      </div>

      {/* Map */}
      <div style={{ gridRow: "2", gridColumn: "3", position: "relative" }}>
        <MapCanvas />
      </div>

      <LayerInfoModal />
    </div>
  );
}
