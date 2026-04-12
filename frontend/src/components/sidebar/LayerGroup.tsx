import { useState } from "react";
import LayerRow from "./LayerRow";
import type { Layer } from "../../types/layer.types";

interface Props {
  title: string;
  layers: Layer[];
}

export default function LayerGroup({ title, layers }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          background: "none",
          border: "none",
          color: "#5A6A7A",
          cursor: "pointer",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <path d="M1 3L5 7L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {expanded && (
        <div>
          {layers.map((layer) => (
            <LayerRow key={layer.slug} layer={layer} />
          ))}
        </div>
      )}
    </div>
  );
}
