import { useState } from "react";
import { useStore } from "../../store";
import CategoryGroup from "./CategoryGroup";
import type { Layer } from "../../types/layer.types";

function groupByCategory(layers: Layer[]): Map<string, Layer[]> {
  const map = new Map<string, Layer[]>();
  for (const layer of layers) {
    const catName = layer.category?.name ?? "Uncategorised";
    if (!map.has(catName)) map.set(catName, []);
    map.get(catName)!.push(layer);
  }
  return map;
}

const OVERLAY_LABELS: Record<string, string> = {
  core: "Core Overlays",
  community: "Community Overlays",
};

interface Props {
  overlayType: "core" | "community";
}

export default function LayerPanel({ overlayType }: Props) {
  const [search, setSearch] = useState("");
  const availableLayers = useStore((s) => s.availableLayers);

  const filtered = availableLayers.filter(
    (l) =>
      (l.category?.overlay_type ?? "core") === overlayType &&
      l.label.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupByCategory(filtered);

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
          padding: "12px 14px 10px",
          borderBottom: "1px solid #253244",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#8B5CF6",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: "8px",
          }}
        >
          {OVERLAY_LABELS[overlayType]}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter layers..."
          style={{
            width: "100%",
            background: "#212D3F",
            border: "1px solid #3A4D62",
            borderRadius: "6px",
            color: "#E8EDF2",
            padding: "8px 10px",
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = "#8B5CF6";
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = "#3A4D62";
          }}
        />
      </div>

      {/* Layer tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {grouped.size === 0 ? (
          <div
            style={{
              padding: "24px 14px",
              color: "#5A6A7A",
              fontSize: "12px",
              textAlign: "center",
            }}
          >
            No layers found
          </div>
        ) : (
          Array.from(grouped.entries()).map(([catName, layers]) => (
            <CategoryGroup key={catName} name={catName} layers={layers} />
          ))
        )}
      </div>
    </div>
  );
}
