import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { fetchNodeCatalog } from "../../api/workflows";
import type { NodePaletteItem } from "../../types/workflow.types";

const CATEGORY_ORDER = ["input", "operators", "processing", "output"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  input: "Inputs",
  operators: "Operators",
  processing: "Processing",
  output: "Output",
};
const CATEGORY_COLOR: Record<string, string> = {
  input: "#3b82f6",
  operators: "#f59e0b",
  processing: "#8B5CF6",
  output: "#22c55e",
};

function PaletteItem({ item }: { item: NodePaletteItem }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/wf-node-type", item.type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={item.description}
      style={{
        background: "#1a2535",
        border: "1px solid #253244",
        borderRadius: 6,
        padding: "7px 10px",
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 8,
        userSelect: "none",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = CATEGORY_COLOR[item.category])
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "#253244")
      }
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: CATEGORY_COLOR[item.category],
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>
        {item.label}
      </span>
    </div>
  );
}

export default function NodePalette() {
  const nodeCatalog = useStore((s) => s.nodeCatalog);
  const setCatalog = useStore((s) => s.setCatalog);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (nodeCatalog.length > 0) return;
    fetchNodeCatalog().then(setCatalog).catch(console.error);
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? nodeCatalog.filter(
        (n) =>
          n.label.toLowerCase().includes(query) ||
          (n.description ?? "").toLowerCase().includes(query)
      )
    : nodeCatalog;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: filtered.filter((n) => n.category === cat),
  }));

  return (
    <div
      style={{
        width: 200,
        background: "#1a2535",
        borderRight: "1px solid #253244",
        display: "flex",
        flexDirection: "column",
        padding: "12px 8px",
        gap: 12,
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", paddingLeft: 2 }}>
        NODE PALETTE
      </div>

      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#111c2b",
            border: "1px solid #253244",
            borderRadius: 5,
            padding: "5px 26px 5px 8px",
            fontSize: 11,
            color: "#e2e8f0",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#253244")}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute",
              right: 5,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              padding: 0,
              fontSize: 13,
              lineHeight: 1,
            }}
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      {nodeCatalog.length === 0 && (
        <div style={{ fontSize: 11, color: "#475569", paddingLeft: 2 }}>Loading nodes…</div>
      )}

      {query && filtered.length === 0 && (
        <div style={{ fontSize: 11, color: "#475569", paddingLeft: 2 }}>No nodes match.</div>
      )}

      {grouped.map(({ cat, items }) =>
        items.length === 0 ? null : (
          <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: CATEGORY_COLOR[cat],
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                paddingLeft: 2,
                marginBottom: 2,
              }}
            >
              {CATEGORY_LABEL[cat]}
            </div>
            {items.map((item) => (
              <PaletteItem key={item.type} item={item} />
            ))}
          </div>
        )
      )}

      <div style={{ marginTop: "auto", fontSize: 10, color: "#475569", paddingLeft: 2 }}>
        Drag nodes onto the canvas
      </div>
    </div>
  );
}
