import { useStore } from "../../store";
import type {
  RasterInputConfig,
  VectorInputConfig,
  NDVIConfig,
  ReclassifyConfig,
  ReclassifyRule,
  ZonalStatsConfig,
} from "../../types/workflow.types";

const STAT_OPTIONS = ["mean", "min", "max", "count", "sum", "std", "median"];

export default function NodeConfigPanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const wfNodes = useStore((s) => s.wfNodes);
  const wfEdges = useStore((s) => s.wfEdges);
  const updateNodeConfig = useStore((s) => s.updateNodeConfig);
  const availableLayers = useStore((s) => s.availableLayers);

  const node = wfNodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <div
        style={{
          width: 280,
          background: "#1a2535",
          borderLeft: "1px solid #253244",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#475569",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        Select a node to configure
      </div>
    );
  }

  const { nodeType, config } = node.data;

  const rasterLayers = availableLayers.filter((l) => l.layer_type === "raster");
  const vectorLayers = availableLayers.filter((l) => l.layer_type === "vector");

  function setConfig(partial: Record<string, unknown>) {
    updateNodeConfig(node!.id, { ...config, ...partial } as any);
  }

  return (
    <div
      style={{
        width: 280,
        background: "#1a2535",
        borderLeft: "1px solid #253244",
        display: "flex",
        flexDirection: "column",
        padding: "12px 12px",
        gap: 14,
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em" }}>
        NODE CONFIG
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
        {node.data.label}
      </div>

      {(nodeType === "raster_input") && (
        <RasterInputForm
          config={config as RasterInputConfig}
          layers={rasterLayers}
          onChange={(partial) => setConfig(partial)}
        />
      )}

      {(nodeType === "vector_input") && (
        <VectorInputForm
          config={config as VectorInputConfig}
          layers={vectorLayers}
          onChange={(v) => setConfig({ layer_slug: v })}
        />
      )}

      {nodeType === "ndvi" && (
        <NDVIForm
          config={config as NDVIConfig}
          onChange={(partial) => setConfig(partial)}
        />
      )}

      {nodeType === "reclassify" && (
        <ReclassifyForm
          config={config as ReclassifyConfig}
          onChange={(rules) => setConfig({ rules })}
        />
      )}

      {nodeType === "zonal_stats" && (
        <ZonalStatsForm
          config={config as ZonalStatsConfig}
          onChange={(stats) => setConfig({ stats })}
        />
      )}

      {nodeType === "raster_calculator" && (
        <RasterCalculatorForm
          expression={(config as { expression: string }).expression ?? ""}
          onChange={(expression) => setConfig({ expression })}
          varHints={(() => {
            const hints: { handle: string; label: string; vars: string[] }[] = [];
            for (const handle of ["A", "B", "C"]) {
              const edge = wfEdges.find(
                (e) => e.target === node.id && e.targetHandle === handle
              );
              if (!edge) continue;
              const srcNode = wfNodes.find((n) => n.id === edge.source);
              if (!srcNode) continue;
              const slug = (srcNode.data.config as Record<string, unknown>)?.layer_slug as string | undefined;
              const layer = availableLayers.find((l) => l.slug === slug);
              const bandCount = layer?.band_count ?? 1;
              const vars = Array.from({ length: bandCount }, (_, i) => `${handle}_b${i + 1}`);
              if (bandCount === 1) vars.unshift(handle);
              hints.push({ handle, label: layer?.label ?? slug ?? handle, vars });
            }
            return hints;
          })()}
        />
      )}

      {!["raster_input", "vector_input", "ndvi", "reclassify", "zonal_stats", "raster_calculator"].includes(nodeType) && (
        <div style={{ color: "#94a3b8", fontSize: 12 }}>
          No configuration required.
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: "#0f1724",
        border: "1px solid #253244",
        borderRadius: 5,
        color: "#e2e8f0",
        padding: "5px 8px",
        fontSize: 12,
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  label,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          background: "#0f1724",
          border: "1px solid #253244",
          borderRadius: 5,
          color: "#e2e8f0",
          padding: "5px 8px",
          fontSize: 12,
        }}
      />
    </div>
  );
}

function RasterInputForm({
  config,
  layers,
  onChange,
}: {
  config: RasterInputConfig;
  layers: { slug: string; label: string; band_count?: number | null }[];
  onChange: (partial: Partial<RasterInputConfig>) => void;
}) {
  const selectedLayer = layers.find((l) => l.slug === config.layer_slug);
  const bandCount = selectedLayer?.band_count ?? 0;
  const bandMode = config.band_mode ?? "all";
  const selectedBands = config.selected_bands ?? [];

  function toggleBand(band: number) {
    const next = selectedBands.includes(band)
      ? selectedBands.filter((b) => b !== band)
      : [...selectedBands, band].sort((a, b) => a - b);
    onChange({ selected_bands: next });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <Label>Raster Layer</Label>
        <Select
          value={config.layer_slug || ""}
          onChange={(v) => onChange({ layer_slug: v, band_mode: "all", selected_bands: [] })}
          placeholder="Select a raster layer..."
          options={layers.map((l) => ({ value: l.slug, label: l.label }))}
        />
      </div>
      {config.layer_slug && bandCount > 1 && (
        <>
          <div>
            <Label>Band Selection</Label>
            <Select
              value={bandMode}
              onChange={(v) => onChange({ band_mode: v as RasterInputConfig["band_mode"], selected_bands: [] })}
              options={[
                { value: "all", label: "All Bands" },
                { value: "single", label: "Single Band" },
                { value: "multi", label: "Multi-Band" },
              ]}
            />
          </div>
          {bandMode === "single" && (
            <NumberInput
              label="Band Index"
              value={selectedBands[0] ?? 1}
              min={1}
              onChange={(v) => onChange({ selected_bands: [v] })}
            />
          )}
          {bandMode === "multi" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Label>Select Bands</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from({ length: bandCount }, (_, i) => i + 1).map((band) => (
                  <button
                    key={band}
                    onClick={() => toggleBand(band)}
                    style={{
                      background: selectedBands.includes(band) ? "#8B5CF622" : "#0f1724",
                      border: `1px solid ${selectedBands.includes(band) ? "#8B5CF6" : "#253244"}`,
                      borderRadius: 4,
                      color: selectedBands.includes(band) ? "#8B5CF6" : "#94a3b8",
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VectorInputForm({
  config,
  layers,
  onChange,
}: {
  config: VectorInputConfig;
  layers: { slug: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>Vector Layer</Label>
      <Select
        value={config.layer_slug || ""}
        onChange={onChange}
        placeholder="Select a vector layer..."
        options={layers.map((l) => ({ value: l.slug, label: l.label }))}
      />
    </div>
  );
}

function NDVIForm({
  config,
  onChange,
}: {
  config: NDVIConfig;
  onChange: (partial: Partial<NDVIConfig>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <NumberInput
        label="NIR Band Index"
        value={config.nir_band ?? 4}
        min={1}
        onChange={(v) => onChange({ nir_band: v })}
      />
      <NumberInput
        label="Red Band Index"
        value={config.red_band ?? 3}
        min={1}
        onChange={(v) => onChange({ red_band: v })}
      />
    </div>
  );
}

function ReclassifyForm({
  config,
  onChange,
}: {
  config: ReclassifyConfig;
  onChange: (rules: ReclassifyRule[]) => void;
}) {
  const rules = config.rules || [];

  function updateRule(i: number, key: keyof ReclassifyRule, val: number) {
    const updated = rules.map((r, idx) => (idx === i ? { ...r, [key]: val } : r));
    onChange(updated);
  }

  function addRule() {
    onChange([...rules, { min: 0, max: 1, new_value: 0 }]);
  }

  function removeRule(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Label>Reclassify Rules</Label>
      {rules.length === 0 && (
        <div style={{ color: "#475569", fontSize: 11 }}>No rules yet.</div>
      )}
      {rules.map((rule, i) => (
        <div
          key={i}
          style={{
            background: "#0f1724",
            border: "1px solid #253244",
            borderRadius: 5,
            padding: "7px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#8B5CF6" }}>Rule {i + 1}</span>
            <button
              onClick={() => removeRule(i)}
              style={{
                background: "none",
                border: "none",
                color: "#ef4444",
                cursor: "pointer",
                fontSize: 11,
                padding: "1px 4px",
              }}
            >
              ✕
            </button>
          </div>
          {(["min", "max", "new_value"] as (keyof ReclassifyRule)[]).map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 58, fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>
                {key === "new_value" ? "→ value" : key}
              </span>
              <input
                type="number"
                value={rule[key]}
                onChange={(e) => updateRule(i, key, Number(e.target.value))}
                style={{
                  flex: 1,
                  background: "#1a2535",
                  border: "1px solid #253244",
                  borderRadius: 4,
                  color: "#e2e8f0",
                  padding: "3px 6px",
                  fontSize: 11,
                }}
              />
            </div>
          ))}
        </div>
      ))}
      <button
        onClick={addRule}
        style={{
          background: "#8B5CF622",
          border: "1px solid #8B5CF644",
          borderRadius: 5,
          color: "#8B5CF6",
          padding: "5px 0",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        + Add Rule
      </button>
    </div>
  );
}

function RasterCalculatorForm({
  expression,
  onChange,
  varHints,
}: {
  expression: string;
  onChange: (expression: string) => void;
  varHints: { handle: string; label: string; vars: string[] }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {varHints.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label>Available Variables</Label>
          {varHints.map(({ handle, label, vars }) => (
            <div
              key={handle}
              style={{
                background: "#0f1724",
                border: "1px solid #253244",
                borderRadius: 5,
                padding: "6px 8px",
              }}
            >
              <div style={{ fontSize: 10, color: "#f59e0b", marginBottom: 4 }}>
                {handle} — {label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {vars.map((v) => (
                  <button
                    key={v}
                    onClick={() => onChange(expression ? `${expression} ${v}` : v)}
                    title="Click to append to expression"
                    style={{
                      background: "#1a2535",
                      border: "1px solid #f59e0b44",
                      borderRadius: 3,
                      color: "#f59e0b",
                      padding: "2px 6px",
                      fontSize: 10,
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {varHints.length === 0 && (
        <div style={{ fontSize: 11, color: "#475569" }}>
          Connect rasters to inputs A, B, or C to see available variables.
        </div>
      )}

      <div>
        <Label>Expression</Label>
        <textarea
          value={expression}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. (A_b4 - A_b3) / (A_b4 + A_b3)"
          rows={4}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0f1724",
            border: "1px solid #253244",
            borderRadius: 5,
            color: "#e2e8f0",
            padding: "5px 8px",
            fontSize: 12,
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

function ZonalStatsForm({
  config,
  onChange,
}: {
  config: ZonalStatsConfig;
  onChange: (stats: string[]) => void;
}) {
  const selected = new Set(config.stats || ["mean", "min", "max", "count"]);

  function toggle(stat: string) {
    const next = new Set(selected);
    if (next.has(stat)) {
      next.delete(stat);
    } else {
      next.add(stat);
    }
    onChange(Array.from(next));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>Statistics</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {STAT_OPTIONS.map((stat) => (
          <button
            key={stat}
            onClick={() => toggle(stat)}
            style={{
              background: selected.has(stat) ? "#8B5CF622" : "#0f1724",
              border: `1px solid ${selected.has(stat) ? "#8B5CF6" : "#253244"}`,
              borderRadius: 4,
              color: selected.has(stat) ? "#8B5CF6" : "#94a3b8",
              padding: "3px 8px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {stat}
          </button>
        ))}
      </div>
    </div>
  );
}
