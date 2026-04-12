import { useState } from "react";
import LayerRow from "./LayerRow";
import type { Layer } from "../../types/layer.types";

interface Props {
  name: string;
  layers: Layer[];
}

export default function CategoryGroup({ name, layers }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: "2px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 14px",
          color: "#8b9db0",
          fontSize: "12px",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "10px" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {name}
        </span>
        <span
          style={{
            marginLeft: "auto",
            background: "#253244",
            color: "#8b9db0",
            borderRadius: "10px",
            padding: "1px 7px",
            fontSize: "11px",
          }}
        >
          {layers.length}
        </span>
      </button>
      {open && (
        <div>
          {layers.map((layer) => (
            <LayerRow key={layer.id} layer={layer} />
          ))}
        </div>
      )}
    </div>
  );
}
