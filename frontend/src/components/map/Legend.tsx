import { useStore } from "../../store";

const COLORMAP_GRADIENTS: Record<string, string> = {
  terrain: "linear-gradient(to right, #006400, #8fbc8f, #f5deb3, #d2691e, #808080, #ffffff)",
  viridis: "linear-gradient(to right, #440154, #31688e, #35b779, #fde725)",
  magma: "linear-gradient(to right, #000004, #51127c, #b73779, #fc8961, #fcfdbf)",
  plasma: "linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)",
  inferno: "linear-gradient(to right, #000004, #56106e, #bc3754, #f98e09, #fcffa4)",
  RdYlGn: "linear-gradient(to right, #d73027, #fc8d59, #fee08b, #d9ef8b, #91cf60, #1a9850)",
  Blues: "linear-gradient(to right, #f7fbff, #9ecae1, #2171b5, #08306b)",
  YlGn: "linear-gradient(to right, #ffffe5, #addd8e, #238443, #004529)",
  grayscale: "linear-gradient(to right, #000000, #ffffff)",
  purple: "linear-gradient(to right, #EDE9FE, #A78BFA, #7C3AED, #5B21B6, #3B0764)",
};

export default function Legend() {
  const { layerConfigs, availableLayers } = useStore((s) => ({
    layerConfigs: s.layerConfigs,
    availableLayers: s.availableLayers,
  }));

  const activeRasterConfigs = Object.values(layerConfigs).filter(
    (c) => c.visible && c.tileUrl
  );

  if (activeRasterConfigs.length === 0) return null;

  const topConfig = activeRasterConfigs[activeRasterConfigs.length - 1];
  const layer = availableLayers.find((l) => l.slug === topConfig.slug);
  if (!layer) return null;

  const gradient = COLORMAP_GRADIENTS[topConfig.colormap] || COLORMAP_GRADIENTS.viridis;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "32px",
        right: "12px",
        zIndex: 1000,
        background: "rgba(21, 29, 43, 0.92)",
        border: "1px solid #3A4D62",
        borderRadius: "8px",
        padding: "10px 12px",
        minWidth: "160px",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "#A78BFA",
          marginBottom: "6px",
          fontWeight: 500,
        }}
      >
        {layer.label}
      </div>
      <div
        style={{
          height: "10px",
          borderRadius: "4px",
          background: gradient,
          marginBottom: "4px",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "#8B9DB0",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        <span>{layer.min_value ?? 0}</span>
        <span>{layer.max_value ?? 1}</span>
      </div>
    </div>
  );
}
