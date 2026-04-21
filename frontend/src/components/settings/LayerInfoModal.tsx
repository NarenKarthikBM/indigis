import { useStore } from "../../store";

export default function LayerInfoModal() {
  const { infoModalLayer, closeInfoModal, availableLayers } = useStore((s) => ({
    infoModalLayer: s.infoModalLayer,
    closeInfoModal: s.closeInfoModal,
    availableLayers: s.availableLayers,
  }));

  if (!infoModalLayer) return null;

  const layer = availableLayers.find((l) => l.slug === infoModalLayer);
  if (!layer) return null;

  return (
    <div
      onClick={closeInfoModal}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#151D2B",
          border: "1px solid #3A4D62",
          borderRadius: "10px",
          padding: "24px",
          maxWidth: "440px",
          width: "90%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid #3A4D62",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "10px",
                color: "#A78BFA",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "4px",
              }}
            >
              {layer.category?.name ?? "Uncategorised"} · {layer.layer_type}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 700,
                color: "#E8EDF2",
              }}
            >
              {layer.label}
            </h2>
          </div>
          <button
            onClick={closeInfoModal}
            style={{
              background: "none",
              border: "none",
              color: "#8B9DB0",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Description */}
        {layer.description && (
          <p
            style={{
              color: "#8B9DB0",
              fontSize: "13px",
              lineHeight: "1.6",
              margin: "0 0 16px 0",
            }}
          >
            {layer.description}
          </p>
        )}

        {/* Metadata grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {layer.data_source && (
            <MetaRow label="Data Source" value={layer.data_source} />
          )}
          {layer.resolution && (
            <MetaRow label="Resolution" value={layer.resolution} />
          )}
          {layer.temporal_coverage && (
            <MetaRow label="Temporal Coverage" value={layer.temporal_coverage} />
          )}
          {layer.min_value != null && layer.max_value != null && (
            <MetaRow
              label="Value Range"
              value={`${layer.min_value} - ${layer.max_value}`}
              mono
            />
          )}
          {(layer.date_start || layer.date_end) && (
            <MetaRow
              label="Date Range"
              value={
                layer.date_start && layer.date_end && layer.date_start !== layer.date_end
                  ? `${layer.date_start} - ${layer.date_end}`
                  : (layer.date_start ?? layer.date_end ?? "")
              }
              mono
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "12px",
        padding: "6px 0",
        borderBottom: "1px solid rgba(42, 42, 74, 0.5)",
      }}
    >
      <span style={{ fontSize: "11px", color: "#8B9DB0", flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: "12px",
          color: "#E8EDF2",
          textAlign: "right",
          fontFamily: mono ? "JetBrains Mono, monospace" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}
