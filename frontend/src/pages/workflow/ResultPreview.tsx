import { useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { useStore } from "../../store";
import { saveAsLayer } from "../../api/workflows";
import { fetchLayers } from "../../api/layers";
import type { WorkflowResult } from "../../types/workflow.types";

function parseBbox(
  bbox: WorkflowResult["bbox"]
): LatLngBoundsExpression | null {
  if (!bbox) return null;
  if (Array.isArray(bbox)) {
    const [minx, miny, maxx, maxy] = bbox;
    return [
      [miny, minx],
      [maxy, maxx],
    ];
  }
  return [
    [bbox.miny, bbox.minx],
    [bbox.maxy, bbox.maxx],
  ];
}

function FitBounds({ bbox }: { bbox: LatLngBoundsExpression | null }) {
  const map = useMap();
  if (bbox) {
    map.fitBounds(bbox, { padding: [20, 20] });
  }
  return null;
}

export default function ResultPreview() {
  const result = useStore((s) => s.executionResult);
  const currentWorkflowId = useStore((s) => s.currentWorkflowId);
  const setAvailableLayers = useStore((s) => s.setAvailableLayers);

  const [collapsed, setCollapsed] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [layerName, setLayerName] = useState("");
  const [colormap, setColormap] = useState("viridis");
  const [savingLayer, setSavingLayer] = useState(false);
  const [layerMsg, setLayerMsg] = useState("");

  if (!result) return null;

  const bounds = parseBbox(result.bbox);
  const canSaveAsLayer = result.status === "completed" && currentWorkflowId !== null;

  async function handleSaveAsLayer() {
    if (!layerName.trim()) {
      setLayerMsg("Enter a layer name");
      setTimeout(() => setLayerMsg(""), 2000);
      return;
    }
    if (!currentWorkflowId) {
      setLayerMsg("Save the workflow first");
      setTimeout(() => setLayerMsg(""), 2000);
      return;
    }
    setSavingLayer(true);
    try {
      await saveAsLayer(currentWorkflowId, {
        name: layerName.trim(),
        colormap: result?.result_type === "raster" ? colormap : undefined,
      });
      setLayerMsg("Layer created!");
      setShowSaveForm(false);
      setLayerName("");
      // Refresh available layers
      fetchLayers().then(setAvailableLayers).catch(() => {});
      setTimeout(() => setLayerMsg(""), 3000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to save layer";
      setLayerMsg(detail);
      setTimeout(() => setLayerMsg(""), 3000);
    } finally {
      setSavingLayer(false);
    }
  }

  const COLORMAPS = ["viridis", "rdylgn", "spectral", "plasma", "inferno", "magma", "terrain", "coolwarm"];

  return (
    <div
      style={{
        borderTop: "1px solid #253244",
        background: "#1a2535",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 14px",
          gap: 10,
        }}
      >
        <span
          style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", cursor: "pointer" }}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "▶" : "▼"} Result Preview
        </span>
        {result.status === "failed" && (
          <span style={{ fontSize: 11, color: "#ef4444" }}>
            Failed: {result.error}
          </span>
        )}
        {result.status === "completed" && result.result_type && (
          <span style={{ fontSize: 11, color: "#22c55e" }}>
            {result.result_type} - completed
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {layerMsg && (
            <span style={{ fontSize: 11, color: layerMsg === "Layer created!" ? "#22c55e" : "#ef4444" }}>
              {layerMsg}
            </span>
          )}
          {canSaveAsLayer && !showSaveForm && (
            <button
              onClick={() => setShowSaveForm(true)}
              style={{
                background: "#1e3a5f",
                border: "1px solid #2563eb",
                borderRadius: 5,
                color: "#93c5fd",
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Save as Layer
            </button>
          )}
          {!canSaveAsLayer && result.status === "completed" && !currentWorkflowId && (
            <span style={{ fontSize: 11, color: "#64748b" }}>
              Save workflow first to export as layer
            </span>
          )}
        </div>
      </div>

      {/* Save as Layer inline form */}
      {showSaveForm && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px 8px",
          }}
        >
          <input
            type="text"
            placeholder="Layer name"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            style={{
              background: "#0f1724",
              border: "1px solid #253244",
              borderRadius: 4,
              color: "#e2e8f0",
              padding: "5px 8px",
              fontSize: 12,
              width: 180,
              outline: "none",
            }}
          />
          {result.result_type === "raster" && (
            <select
              value={colormap}
              onChange={(e) => setColormap(e.target.value)}
              style={{
                background: "#0f1724",
                border: "1px solid #253244",
                borderRadius: 4,
                color: "#e2e8f0",
                padding: "5px 6px",
                fontSize: 12,
                outline: "none",
              }}
            >
              {COLORMAPS.map((cm) => (
                <option key={cm} value={cm}>{cm}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleSaveAsLayer}
            disabled={savingLayer}
            style={{
              background: "#2563eb",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              padding: "5px 12px",
              cursor: savingLayer ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {savingLayer ? "Saving..." : "Create"}
          </button>
          <button
            onClick={() => setShowSaveForm(false)}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {!collapsed && result.status === "completed" && (
        <div style={{ height: 280 }}>
          {result.result_type === "raster" && result.tile_url && (
            <MapContainer
              style={{ height: "100%", width: "100%" }}
              center={[20, 80]}
              zoom={4}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap"
                opacity={0.3}
              />
              <TileLayer url={result.tile_url} />
              {bounds && <FitBounds bbox={bounds} />}
            </MapContainer>
          )}
          {result.result_type === "vector" && result.geojson && (
            <MapContainer
              style={{ height: "100%", width: "100%" }}
              center={[20, 80]}
              zoom={4}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap"
                opacity={0.4}
              />
              <GeoJSON
                key={JSON.stringify(result.geojson).slice(0, 50)}
                data={result.geojson}
                style={{ color: "#8B5CF6", weight: 1.5 }}
              />
              {bounds && <FitBounds bbox={bounds} />}
            </MapContainer>
          )}
        </div>
      )}

      {!collapsed && result.status === "failed" && (
        <div
          style={{
            padding: "12px 14px",
            color: "#ef4444",
            fontSize: 12,
            background: "#1a0a0a",
          }}
        >
          {result.error || "Unknown error"}
        </div>
      )}
    </div>
  );
}
