interface Props {
  value: number;
  onChange: (value: number) => void;
}

export default function OpacitySlider({ value, onChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "2px 14px 6px 42px",
      }}
    >
      <span style={{ fontSize: "10px", color: "#8B9DB0", flexShrink: 0 }}>Opacity</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "#8B5CF6" }}
      />
      <span
        style={{
          fontSize: "10px",
          color: "#8B9DB0",
          fontFamily: "JetBrains Mono, monospace",
          minWidth: "28px",
          textAlign: "right",
        }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
