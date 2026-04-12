import { useStore } from "../../store";
import { useLayerManager } from "../../hooks/useLayerManager";
import OpacitySlider from "./OpacitySlider";
import type { Layer } from "../../types/layer.types";

const LAYER_ICONS: Record<string, string> = {
  dtm: "⛰",
  lulc: "🗺",
  "water-bodies": "💧",
  ndvi: "🌿",
  railways: "🚂",
  roadways: "🛣",
};

interface Props {
  layer: Layer;
}

export default function LayerRow({ layer }: Props) {
  const { layerConfigs, setLayerOpacity } = useStore((s) => ({
    layerConfigs: s.layerConfigs,
    setLayerOpacity: s.setLayerOpacity,
  }));

  const { handleToggle } = useLayerManager();
  const config = layerConfigs[layer.slug];
  const isActive = config?.visible ?? false;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 14px",
          cursor: "pointer",
          background: isActive ? "rgba(139, 92, 246, 0.12)" : "transparent",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(42, 58, 80, 0.5)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        {/* Icon */}
        <span style={{ fontSize: "14px", width: "20px", textAlign: "center", flexShrink: 0 }}>
          {LAYER_ICONS[layer.slug] || "◼"}
        </span>

        {/* Name */}
        <span
          style={{
            flex: 1,
            fontSize: "12px",
            color: isActive ? "#E8EDF2" : "#8B9DB0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {layer.label}
        </span>

        {/* Toggle */}
        <button
          onClick={() => handleToggle(layer.slug, layer.id)}
          style={{
            width: "32px",
            height: "18px",
            borderRadius: "9px",
            background: isActive ? "#8B5CF6" : "#253244",
            border: "none",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
          title={isActive ? "Hide layer" : "Show layer"}
        >
          <span
            style={{
              position: "absolute",
              top: "2px",
              left: isActive ? "16px" : "2px",
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "#E8EDF2",
              transition: "left 0.2s",
            }}
          />
        </button>
      </div>

      {/* Opacity slider when active */}
      {isActive && config && (
        <OpacitySlider
          value={config.opacity}
          onChange={(v) => setLayerOpacity(layer.slug, v)}
        />
      )}
    </div>
  );
}
