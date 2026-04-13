import { useState } from "react";
import { useStore } from "../../store";
import { useLayerManager } from "../../hooks/useLayerManager";
import { fetchTileURL } from "../../api/layers";
import OpacitySlider from "../sidebar/OpacitySlider";
import ColormapPicker from "./ColormapPicker";

const COMPOSITE_PRESETS = [
  { label: "True Color", bands: [3, 2, 1] as [number, number, number], minBands: 3 },
  { label: "False Color NIR", bands: [4, 3, 2] as [number, number, number], minBands: 4 },
  { label: "SWIR", bands: [5, 4, 3] as [number, number, number], minBands: 5 },
  { label: "Agriculture", bands: [5, 4, 2] as [number, number, number], minBands: 5 },
];

interface Props {
  slug: string;
}

function AccordionSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #253244" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "none",
          border: "none",
          color: "#8B9DB0",
          cursor: "pointer",
          fontSize: "11px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {title}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <path d="M1 3L5 7L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && <div style={{ padding: "4px 14px 14px" }}>{children}</div>}
    </div>
  );
}

const BAND_COLORMAP_OPTIONS = ["reds", "greens", "blues", "oranges", "purples", "greys"];

export default function DisplayAccordion({ slug }: Props) {
  const { layerConfigs, setLayerOpacity, setMultiBandMode, setCompositeMode, availableLayers } = useStore((s) => ({
    layerConfigs: s.layerConfigs,
    setLayerOpacity: s.setLayerOpacity,
    setMultiBandMode: s.setMultiBandMode,
    setCompositeMode: s.setCompositeMode,
    availableLayers: s.availableLayers,
  }));

  const { handleColormapChange, handleEnableMultiBand, handleBandConfigChange, handleEnableComposite, handleCompositeBandChange, handlePeriodChange } = useLayerManager();
  const config = layerConfigs[slug];
  const layer = availableLayers.find((l) => l.slug === slug);

  if (!config || !layer) {
    return (
      <div style={{ padding: "14px", color: "#8B9DB0", fontSize: "12px" }}>
        Toggle the layer on to configure it.
      </div>
    );
  }

  const sortedAssets = layer.layer_type === "raster" && layer.raster_assets.length > 1
    ? [...layer.raster_assets].sort((a, b) => {
        const dateA = a.data_period_end ?? a.created_at;
        const dateB = b.data_period_end ?? b.created_at;
        return dateB.localeCompare(dateA);  // latest first
      })
    : [];

  const isMultiBandCapable = layer.layer_type === "raster" && (layer.band_count ?? 0) > 1;
  const isCompositeCapable = layer.layer_type === "raster" && (layer.band_count ?? 0) >= 3;
  const bandCount = layer.band_count ?? 0;

  return (
    <div>
      <AccordionSection title="Display">
        <div style={{ marginTop: "4px" }}>
          <div style={{ fontSize: "11px", color: "#8B9DB0", marginBottom: "6px" }}>
            Opacity
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.opacity}
              onChange={(e) => setLayerOpacity(slug, Number(e.target.value))}
              style={{ flex: 1, accentColor: "#8B5CF6" }}
            />
            <span
              style={{
                fontSize: "11px",
                color: "#E8EDF2",
                fontFamily: "JetBrains Mono, monospace",
                minWidth: "32px",
                textAlign: "right",
              }}
            >
              {Math.round(config.opacity * 100)}%
            </span>
          </div>
        </div>
      </AccordionSection>

      {sortedAssets.length > 1 && (
        <AccordionSection title="Time Period">
          <select
            value={config.selectedPeriodLabel ?? ""}
            onChange={(e) => handlePeriodChange(slug, e.target.value)}
            style={{
              width: "100%",
              background: "#1a2535",
              border: "1px solid #253244",
              borderRadius: 4,
              color: "#e2e8f0",
              padding: "5px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <option value="">Latest</option>
            {sortedAssets.map((asset) => {
              const label = asset.period_label || asset.created_at.slice(0, 10);
              const display = asset.data_period_end
                ? asset.data_period_end
                : label;
              return (
                <option key={asset.id} value={asset.period_label}>
                  {display}
                </option>
              );
            })}
          </select>
          <div style={{ marginTop: 4, fontSize: 10, color: "#556070" }}>
            {sortedAssets.length} period{sortedAssets.length !== 1 ? "s" : ""} available
          </div>
        </AccordionSection>
      )}

      {layer.layer_type === "raster" && !config.multiBandMode && !config.compositeMode && (
        <AccordionSection title="Colormap">
          <ColormapPicker
            value={config.colormap}
            onChange={(cm) => handleColormapChange(slug, cm)}
          />
        </AccordionSection>
      )}

      {isMultiBandCapable && (
        <AccordionSection title="Band Overlays" defaultOpen={false}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", color: "#8B9DB0" }}>Multi-band overlay</span>
            <button
              onClick={() => {
                if (config.multiBandMode) {
                  setMultiBandMode(slug, false);
                } else {
                  handleEnableMultiBand(slug);
                }
              }}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: config.multiBandMode ? "#8B5CF6" : "#253244",
                position: "relative",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: "#fff",
                  position: "absolute",
                  top: 3,
                  left: config.multiBandMode ? 19 : 3,
                  transition: "left 0.15s",
                }}
              />
            </button>
          </div>
          {config.multiBandMode && config.bandConfigs && (
            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {config.bandConfigs.map((bc) => (
                <div
                  key={bc.bandIndex}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 6px",
                    background: "#0f1724",
                    borderRadius: 4,
                    border: "1px solid #253244",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={bc.visible}
                    onChange={(e) => handleBandConfigChange(slug, bc.bandIndex, { visible: e.target.checked })}
                    style={{ accentColor: "#8B5CF6", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 10, color: "#E8EDF2", minWidth: 42, flexShrink: 0 }}>
                    Band {bc.bandIndex}
                  </span>
                  <select
                    value={bc.colormap}
                    onChange={(e) => handleBandConfigChange(slug, bc.bandIndex, { colormap: e.target.value })}
                    style={{
                      flex: 1,
                      background: "#1a2535",
                      border: "1px solid #253244",
                      borderRadius: 3,
                      color: "#e2e8f0",
                      padding: "2px 4px",
                      fontSize: 10,
                    }}
                  >
                    {BAND_COLORMAP_OPTIONS.map((cm) => (
                      <option key={cm} value={cm}>{cm}</option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={bc.opacity}
                    onChange={(e) => handleBandConfigChange(slug, bc.bandIndex, { opacity: Number(e.target.value) })}
                    style={{ width: 48, accentColor: "#8B5CF6" }}
                  />
                </div>
              ))}
            </div>
          )}
        </AccordionSection>
      )}

      {isCompositeCapable && (
        <AccordionSection title="Band Composite" defaultOpen={false}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", color: "#8B9DB0" }}>RGB composite</span>
            <button
              onClick={async () => {
                if (config.compositeMode) {
                  setCompositeMode(slug, false);
                  try {
                    const data = await fetchTileURL(slug, config.colormap);
                    useStore.getState().setLayerTileUrl(slug, data.tile_url);
                  } catch (err) {
                    console.error(`Failed to restore tile for ${slug}:`, err);
                  }
                } else {
                  handleEnableComposite(slug);
                }
              }}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: config.compositeMode ? "#8B5CF6" : "#253244",
                position: "relative",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: "#fff",
                  position: "absolute",
                  top: 3,
                  left: config.compositeMode ? 19 : 3,
                  transition: "left 0.15s",
                }}
              />
            </button>
          </div>

          {config.compositeMode && config.compositeBands && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Preset buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {COMPOSITE_PRESETS.filter((p) => bandCount >= p.minBands).map((preset) => {
                  const isActive =
                    config.compositeBands![0] === preset.bands[0] &&
                    config.compositeBands![1] === preset.bands[1] &&
                    config.compositeBands![2] === preset.bands[2];
                  return (
                    <button
                      key={preset.label}
                      onClick={() => handleCompositeBandChange(slug, preset.bands)}
                      style={{
                        padding: "3px 8px",
                        fontSize: 10,
                        borderRadius: 12,
                        border: "none",
                        cursor: "pointer",
                        background: isActive ? "#8B5CF6" : "#253244",
                        color: isActive ? "#fff" : "#8B9DB0",
                        transition: "background 0.15s",
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Channel dropdowns */}
              {(["Red", "Green", "Blue"] as const).map((channel, idx) => {
                const dotColor = channel === "Red" ? "#ef4444" : channel === "Green" ? "#22c55e" : "#3b82f6";
                return (
                  <div key={channel} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "#8B9DB0", minWidth: 36 }}>{channel}</span>
                    <select
                      value={config.compositeBands![idx]}
                      onChange={(e) => {
                        const newBands = [...config.compositeBands!] as [number, number, number];
                        newBands[idx] = Number(e.target.value);
                        handleCompositeBandChange(slug, newBands);
                      }}
                      style={{
                        flex: 1,
                        background: "#1a2535",
                        border: "1px solid #253244",
                        borderRadius: 3,
                        color: "#e2e8f0",
                        padding: "2px 4px",
                        fontSize: 10,
                      }}
                    >
                      {Array.from({ length: bandCount }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Band {i + 1}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionSection>
      )}
    </div>
  );
}
