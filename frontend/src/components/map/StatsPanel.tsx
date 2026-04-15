import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { fetchRegionStats, buildExportUrl } from "../../api/stats";
import type { RegionStatsResponse } from "../../types/stats.types";
import Histogram from "./Histogram";

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs === 0) return "0";
  if (abs >= 10000 || (abs < 0.001)) return v.toExponential(2);
  return parseFloat(v.toPrecision(4)).toString();
}

// ── Distribution plot (extended boxplot) ─────────────────────────────────────

interface StatsPlotProps {
  s: RegionStatsResponse;
}

function StatsPlot({ s }: StatsPlotProps) {
  const { min, max, p25, p75, median, mean, std, p95 } = s;
  if (min == null || max == null || min === max) return null;

  // Capture narrowed values so inner functions retain the `number` type.
  const minVal = min;
  const maxVal = max;

  const W = 272;
  const H = 88;
  const padL = 8;
  const padR = 8;
  const plotW = W - padL - padR;
  const midY = 32;    // vertical centre of the plot track
  const boxH = 18;    // height of the IQR box
  const labelY = H - 6; // y for axis labels

  function x(v: number): number {
    return padL + ((v - minVal) / (maxVal - minVal)) * plotW;
  }
  function clamp(v: number): number {
    return Math.min(maxVal, Math.max(minVal, v));
  }

  // ── build elements ────────────────────────────────────────────────────────

  const xMin = x(minVal);
  const xMax = x(maxVal);

  // Std-dev band around mean
  const stdBand =
    mean != null && std != null && std > 0
      ? { x1: x(clamp(mean - std)), x2: x(clamp(mean + std)) }
      : null;

  // IQR box
  const iqrBox =
    p25 != null && p75 != null ? { x1: x(p25), x2: x(p75) } : null;

  // Median line
  const xMedian = median != null ? x(median) : null;

  // Mean marker
  const xMean = mean != null ? x(mean) : null;

  // p95 tick
  const xP95 = p95 != null ? x(p95) : null;

  // ── axis labels (only non-overlapping ones) ───────────────────────────────
  // Build list and suppress labels that are within 20px of a prior one
  const rawLabels: { v: number; text: string }[] = [
    { v: minVal, text: fmt(minVal) },
    ...(p25 != null ? [{ v: p25, text: fmt(p25) }] : []),
    ...(median != null ? [{ v: median, text: fmt(median) }] : []),
    ...(mean != null ? [{ v: mean, text: fmt(mean) }] : []),
    ...(p75 != null ? [{ v: p75, text: fmt(p75) }] : []),
    ...(p95 != null ? [{ v: p95, text: fmt(p95) }] : []),
    { v: maxVal, text: fmt(maxVal) },
  ].sort((a, b) => a.v - b.v);

  const labels: { xPos: number; text: string; anchor: "start" | "middle" | "end" }[] = [];
  let prevX = -Infinity;
  for (const lb of rawLabels) {
    const xPos = x(lb.v);
    if (xPos - prevX < 28) continue;
    const anchor: "start" | "middle" | "end" =
      xPos < padL + 30 ? "start" : xPos > W - padR - 30 ? "end" : "middle";
    labels.push({ xPos, text: lb.text, anchor });
    prevX = xPos;
  }

  return (
    <svg
      width={W}
      height={H}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Full range line */}
      <line
        x1={xMin} y1={midY} x2={xMax} y2={midY}
        stroke="#2A3D50" strokeWidth={2} strokeLinecap="round"
      />

      {/* Std-dev band */}
      {stdBand && (
        <rect
          x={stdBand.x1}
          y={midY - boxH / 2 - 4}
          width={stdBand.x2 - stdBand.x1}
          height={boxH + 8}
          rx={3}
          fill="#8B5CF6"
          opacity={0.12}
        />
      )}

      {/* IQR box (p25–p75) */}
      {iqrBox && (
        <rect
          x={iqrBox.x1}
          y={midY - boxH / 2}
          width={iqrBox.x2 - iqrBox.x1}
          height={boxH}
          rx={3}
          fill="#8B5CF6"
          opacity={0.45}
        />
      )}

      {/* p95 tick */}
      {xP95 != null && (
        <line
          x1={xP95} y1={midY - 8} x2={xP95} y2={midY + 8}
          stroke="#60A5FA" strokeWidth={1.5} opacity={0.7}
        />
      )}

      {/* Median line */}
      {xMedian != null && (
        <line
          x1={xMedian} y1={midY - boxH / 2 - 1}
          x2={xMedian} y2={midY + boxH / 2 + 1}
          stroke="#F8FAFC" strokeWidth={2.5} strokeLinecap="round"
        />
      )}

      {/* Mean diamond */}
      {xMean != null && (
        <polygon
          points={`${xMean},${midY - 6} ${xMean + 5},${midY} ${xMean},${midY + 6} ${xMean - 5},${midY}`}
          fill="#FBBF24"
          stroke="#0D1420"
          strokeWidth={1}
        />
      )}

      {/* Axis base line */}
      <line
        x1={xMin} y1={midY + 14} x2={xMax} y2={midY + 14}
        stroke="#2A3D50" strokeWidth={1}
      />

      {/* Axis labels */}
      {labels.map((lb, i) => (
        <text
          key={i}
          x={lb.xPos}
          y={labelY}
          textAnchor={lb.anchor}
          fill="#6B7E90"
          fontSize={9}
        >
          {lb.text}
        </text>
      ))}
    </svg>
  );
}

// ── Legend strip for the plot ─────────────────────────────────────────────────

function PlotLegend() {
  const items = [
    { shape: "rect", color: "#8B5CF6", label: "IQR (p25–p75)" },
    { shape: "rect", color: "#8B5CF620", label: "±1 Std Dev", border: "#8B5CF6" },
    { shape: "line", color: "#F8FAFC", label: "Median" },
    { shape: "diamond", color: "#FBBF24", label: "Mean" },
    { shape: "line", color: "#60A5FA", label: "p95" },
  ] as const;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 12px",
        marginTop: "4px",
        marginBottom: "10px",
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <svg width={12} height={12}>
            {item.shape === "rect" && (
              <rect
                x={1} y={3} width={10} height={6} rx={1}
                fill={item.color}
                stroke={"border" in item ? item.border : "none"}
                strokeWidth={1}
              />
            )}
            {item.shape === "line" && (
              <line x1={6} y1={1} x2={6} y2={11} stroke={item.color} strokeWidth={2} />
            )}
            {item.shape === "diamond" && (
              <polygon
                points="6,1 11,6 6,11 1,6"
                fill={item.color}
                stroke="#0D1420"
                strokeWidth={0.5}
              />
            )}
          </svg>
          <span style={{ fontSize: "9px", color: "#6B7E90" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── All stats in a flat grid ──────────────────────────────────────────────────

const ALL_STATS: { key: keyof RegionStatsResponse; label: string }[] = [
  { key: "mean",    label: "Mean"     },
  { key: "median",  label: "Median"   },
  { key: "min",     label: "Min"      },
  { key: "max",     label: "Max"      },
  { key: "std",     label: "Std Dev"  },
  { key: "variance",label: "Variance" },
  { key: "p25",     label: "p25"      },
  { key: "p75",     label: "p75"      },
  { key: "p95",     label: "p95"      },
  { key: "cv",      label: "CV"       },
  { key: "sum",     label: "Sum"      },
  { key: "count",   label: "Count"    },
];

// ── Panel ─────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  width: "320px",
  height: "100%",
  zIndex: 1000,
  background: "rgba(13, 20, 31, 0.96)",
  backdropFilter: "blur(8px)",
  borderLeft: "1px solid #1E2D3D",
  display: "flex",
  flexDirection: "column",
  fontFamily: "inherit",
  color: "#CBD5E1",
  fontSize: "13px",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "#0D1420",
  border: "1px solid #1E2D3D",
  borderRadius: "6px",
  color: "#CBD5E1",
  fontSize: "12px",
  padding: "6px 8px",
};

export default function StatsPanel() {
  const activeRegion    = useStore((s) => s.activeRegion);
  const setActiveRegion = useStore((s) => s.setActiveRegion);
  const layerOrder      = useStore((s) => s.layerOrder);
  const layerConfigs    = useStore((s) => s.layerConfigs);
  const availableLayers = useStore((s) => s.availableLayers);

  const [selectedSlug,   setSelectedSlug]   = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [stats,          setStats]          = useState<RegionStatsResponse | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Sync selectedSlug to topmost visible layer
  useEffect(() => {
    if (layerOrder.length === 0) { setSelectedSlug(""); return; }
    const top = layerOrder[layerOrder.length - 1];
    setSelectedSlug((prev) => (layerOrder.includes(prev) ? prev : top));
  }, [layerOrder]);

  // Sync period to layer config when slug changes
  useEffect(() => {
    if (!selectedSlug) return;
    const configured = layerConfigs[selectedSlug]?.selectedPeriodLabel ?? "";
    setSelectedPeriod(configured || "");
  }, [selectedSlug, layerConfigs]);

  // Fetch stats
  useEffect(() => {
    if (!activeRegion || !selectedSlug) { setStats(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: Parameters<typeof fetchRegionStats>[0] = {
      layer_slug: selectedSlug,
      ...(activeRegion.type === "state"
        ? { state_code: activeRegion.code }
        : { district_code: activeRegion.code }),
      ...(selectedPeriod ? { period_label: selectedPeriod } : {}),
    };

    fetchRegionStats(params)
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          if (!selectedPeriod && data.period_label) setSelectedPeriod(data.period_label);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.error ?? "No stats available for this layer");
          setStats(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [activeRegion, selectedSlug, selectedPeriod]);

  if (!activeRegion || layerOrder.length === 0) return null;

  const regionLabel    = availableLayers.find((l) => l.slug === selectedSlug)?.label ?? selectedSlug;
  const availablePeriods = stats?.available_periods ?? [];
  const exportBase = {
    layer_slug: selectedSlug,
    ...(activeRegion.type === "state"
      ? { state_code: activeRegion.code }
      : { district_code: activeRegion.code }),
    ...(selectedPeriod ? { period_label: selectedPeriod } : {}),
  };

  return (
    <div style={panelStyle}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: "1px solid #1E2D3D",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: "8px", flexShrink: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#E2E8F0", wordBreak: "break-word" }}>
              {activeRegion.name}
            </span>
            <span style={{
              fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "999px",
              background: activeRegion.type === "state" ? "#1E3A5F" : "#1E3A2F",
              color: activeRegion.type === "state" ? "#60A5FA" : "#4ADE80",
              letterSpacing: "0.5px", textTransform: "uppercase", flexShrink: 0,
            }}>
              {activeRegion.type === "state" ? "State" : "District"}
            </span>
          </div>
          {activeRegion.type === "district" && activeRegion.state_name && (
            <div style={{ fontSize: "11px", color: "#6B7E90", marginTop: "2px" }}>
              {activeRegion.state_name}
            </div>
          )}
        </div>
        <button onClick={() => setActiveRegion(null)} title="Close" style={{
          flexShrink: 0, background: "none", border: "none",
          color: "#6B7E90", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "2px 4px",
        }}>×</button>
      </div>

      {/* ── Layer selector ─────────────────────────────────────────────────── */}
      {layerOrder.length > 1 && (
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <label style={{ fontSize: "11px", color: "#6B7E90", display: "block", marginBottom: "4px" }}>LAYER</label>
          <select value={selectedSlug} onChange={(e) => { setSelectedSlug(e.target.value); setSelectedPeriod(""); }} style={selectStyle}>
            {layerOrder.map((slug) => (
              <option key={slug} value={slug}>
                {availableLayers.find((l) => l.slug === slug)?.label ?? slug}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Period selector ────────────────────────────────────────────────── */}
      {availablePeriods.length > 1 && (
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <label style={{ fontSize: "11px", color: "#6B7E90", display: "block", marginBottom: "4px" }}>PERIOD</label>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} style={selectStyle}>
            {availablePeriods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* ── Body (scrollable) ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "12px 16px", overflowY: "auto" }}>

        {/* Loading skeleton */}
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            height: "32px", background: "#111827", borderRadius: "4px",
            marginBottom: "6px", opacity: 0.6,
          }} />
        ))}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#6B7E90", fontSize: "12px" }}>
            {error}
          </div>
        )}

        {/* Stats content */}
        {!loading && stats && (
          <>
            {/* Subtitle */}
            <div style={{ fontSize: "11px", color: "#6B7E90", marginBottom: "10px" }}>
              {regionLabel}
              {stats.period_label && (
                <span style={{ marginLeft: "6px", color: "#4B6B8A" }}>· {stats.period_label}</span>
              )}
            </div>

            {/* ── Distribution plot ─────────────────────────────────────── */}
            {stats.min != null && stats.max != null && stats.min !== stats.max && (
              <div style={{ marginBottom: "6px" }}>
                <div style={{ fontSize: "11px", color: "#6B7E90", marginBottom: "6px" }}>
                  DISTRIBUTION SUMMARY
                </div>
                <StatsPlot s={stats} />
                <PlotLegend />
              </div>
            )}

            {/* ── All-stats grid (2 columns × 6 rows) ───────────────────── */}
            <div style={{ fontSize: "11px", color: "#6B7E90", marginBottom: "6px" }}>
              ALL STATISTICS
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: "5px", marginBottom: "14px",
            }}>
              {ALL_STATS.map(({ key, label }) => (
                <div key={key} style={{
                  background: "#111827", borderRadius: "6px",
                  padding: "7px 10px", border: "1px solid #1E2D3D",
                }}>
                  <div style={{ fontSize: "10px", color: "#6B7E90", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#E2E8F0" }}>
                    {fmt(stats[key] as number | null)}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Histogram ─────────────────────────────────────────────── */}
            {stats.histogram?.bins && stats.histogram?.counts && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", color: "#6B7E90", marginBottom: "6px" }}>
                  PIXEL HISTOGRAM
                </div>
                <Histogram bins={stats.histogram.bins} counts={stats.histogram.counts} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer: export links ───────────────────────────────────────────── */}
      {!loading && !error && stats && (
        <div style={{
          padding: "10px 16px", borderTop: "1px solid #1E2D3D",
          display: "flex", gap: "8px", flexShrink: 0,
        }}>
          <a href={buildExportUrl({ ...exportBase, scope: "region" })} download style={{
            flex: 1, textAlign: "center", padding: "7px 0",
            borderRadius: "6px", background: "#1E2D3D", color: "#8B5CF6",
            fontSize: "11px", fontWeight: 600, textDecoration: "none", border: "1px solid #2A3D50",
          }}>
            Export Region CSV
          </a>
          <a href={buildExportUrl({ ...exportBase, scope: "all" })} download style={{
            flex: 1, textAlign: "center", padding: "7px 0",
            borderRadius: "6px", background: "#1E2D3D", color: "#6B7E90",
            fontSize: "11px", fontWeight: 600, textDecoration: "none", border: "1px solid #2A3D50",
          }}>
            Export All CSV
          </a>
        </div>
      )}
    </div>
  );
}
