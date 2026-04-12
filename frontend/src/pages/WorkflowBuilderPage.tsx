import { useEffect, useState } from "react";
import { useStore } from "../store";
import { fetchLayers } from "../api/layers";
import TopBar from "../components/layout/TopBar";
import NavRail from "../components/layout/NavRail";
import WorkflowToolbar from "./workflow/WorkflowToolbar";
import NodePalette from "./workflow/NodePalette";
import WorkflowCanvas from "./workflow/WorkflowCanvas";
import NodeConfigPanel from "./workflow/NodeConfigPanel";
import ResultPreview from "./workflow/ResultPreview";
import WorkflowBrowser from "./workflow/WorkflowBrowser";

export default function WorkflowBuilderPage() {
  const setAvailableLayers = useStore((s) => s.setAvailableLayers);
  const availableLayers = useStore((s) => s.availableLayers);
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    if (availableLayers.length === 0) {
      fetchLayers()
        .then(setAvailableLayers)
        .catch(() => {});
    }
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "72px 1fr",
        gridTemplateColumns: "72px 1fr",
        height: "100vh",
        overflow: "hidden",
        background: "#0f1724",
        color: "#e2e8f0",
        fontFamily: "'Inter', system-ui, sans-serif",
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

      {/* Workflow Content */}
      <div
        style={{
          gridRow: "2",
          gridColumn: "2",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <WorkflowToolbar onOpenBrowser={() => setShowBrowser(true)} />

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <NodePalette />
          <WorkflowCanvas />
          <NodeConfigPanel />
        </div>

        <ResultPreview />
      </div>

      {showBrowser && (
        <WorkflowBrowser onClose={() => setShowBrowser(false)} />
      )}
    </div>
  );
}
