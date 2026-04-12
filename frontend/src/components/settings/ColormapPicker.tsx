const COLORMAPS = [
  { name: "viridis", label: "Viridis", gradient: "linear-gradient(to right, #440154, #31688e, #35b779, #fde725)" },
  { name: "magma", label: "Magma", gradient: "linear-gradient(to right, #000004, #51127c, #b73779, #fc8961, #fcfdbf)" },
  { name: "terrain", label: "Terrain", gradient: "linear-gradient(to right, #006400, #8fbc8f, #f5deb3, #d2691e, #808080, #ffffff)" },
  { name: "RdYlGn", label: "Red-Green", gradient: "linear-gradient(to right, #d73027, #fee08b, #1a9850)" },
  { name: "plasma", label: "Plasma", gradient: "linear-gradient(to right, #0d0887, #cc4778, #f0f921)" },
  { name: "inferno", label: "Inferno", gradient: "linear-gradient(to right, #000004, #bc3754, #fcffa4)" },
  { name: "Blues", label: "Blues", gradient: "linear-gradient(to right, #f7fbff, #9ecae1, #08306b)" },
  { name: "YlGn", label: "Yellow-Green", gradient: "linear-gradient(to right, #ffffe5, #addd8e, #004529)" },
  { name: "grayscale", label: "Grayscale", gradient: "linear-gradient(to right, #000000, #ffffff)" },
  { name: "purple", label: "IndiGIS Purple", gradient: "linear-gradient(to right, #EDE9FE, #A78BFA, #7C3AED, #3B0764)" },
];

interface Props {
  value: string;
  onChange: (colormap: string) => void;
}

export default function ColormapPicker({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {COLORMAPS.map((cm) => (
        <button
          key={cm.name}
          onClick={() => onChange(cm.name)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            background: "none",
            border: `1px solid ${value === cm.name ? "#8B5CF6" : "transparent"}`,
            borderRadius: "5px",
            cursor: "pointer",
            transition: "border-color 0.15s",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "14px",
              borderRadius: "3px",
              background: cm.gradient,
            }}
          />
          <span
            style={{
              fontSize: "11px",
              color: value === cm.name ? "#E8EDF2" : "#8B9DB0",
              minWidth: "80px",
              textAlign: "left",
            }}
          >
            {cm.label}
          </span>
        </button>
      ))}
    </div>
  );
}
