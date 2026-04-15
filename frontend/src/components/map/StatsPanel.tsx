import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { fetchRegionStats, buildExportUrl } from "../../api/stats";
import type { RegionStatsResponse } from "../../types/stats.types";
import Histogram from "./Histogram";

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs === 0) return "0";
  if (abs >= 1000 || (abs < 0.001)) return v.toPrecision(3);
  return parseFloat(v.toPrecision(3)).toString();
}

const STAT_ROWS: { key: keyof RegionStatsResponse; label: string }[] = [
  { key: "mean", label: "Mean" },
  { key: "min", label: "Min" },
  { key: "max", label: "Max" },
  { key: "std", label: "Std Dev" },
  { key: "median", label: "Median" },
  { key: "count", label: "Count" },
];

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
  overflowY: "auto",
  fontFamily: "inherit",
  color: "#CBD5E1",
  fontSize: "13px",
};

export default function StatsPanel() {
  const activeRegion = useStore((s) => s.activeRegion);
  const setActiveRegion = useStore((s) => s.setActiveRegion);
  const layerOrder = useStore((s) => s.layerOrder);
  const layerConfigs = useStore((s) => s.layerConfigs);
  const availableLayers = useStore((s) => s.availableLayers);

  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [stats, setStats] = useState<RegionStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selectedSlug to topmost visible layer
  useEffect(() => {
    if (layerOrder.length === 0) {
      setSelectedSlug("");
      return;
    }
    const topSlug = layerOrder[layerOrder.length - 1];
    setSelectedSlug((prev) => (layerOrder.includes(prev) ? prev : topSlug));
  }, [layerOrder]);

  // Sync selectedPeriod to layer's configured period when slug changes
  useEffect(() => {
    if (!selectedSlug) return;
    const configuredPeriod = layerConfigs[selectedSlug]?.selectedPeriodLabel ?? "";
    setSelectedPeriod(configuredPeriod || "");
  }, [selectedSlug, layerConfigs]);

  // Fetch stats when region, slug, or period changes
  useEffect(() => {
    if (!activeRegion || !selectedSlug) {
      setStats(null);
      return;
    }
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
          // If no period was selected, seed it from the response
          if (!selectedPeriod && data.period_label) {
            setSelectedPeriod(data.period_label);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err?.response?.data?.error ?? "No stats available for this layer";
          setError(msg);
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeRegion, selectedSlug, selectedPeriod]);

  if (!activeRegion || layerOrder.length === 0) return null;

  const regionLabel = availableLayers.find((l) => l.slug === selectedSlug)?.label ?? selectedSlug;
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
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid #1E2D3D",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#E2E8F0", wordBreak: "break-word" }}>
              {activeRegion.name}
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: "999px",
                background: activeRegion.type === "state" ? "#1E3A5F" : "#1E3A2F",
                color: activeRegion.type === "state" ? "#60A5FA" : "#4ADE80",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              {activeRegion.type === "state" ? "State" : "District"}
            </span>
          </div>
          {activeRegion.type === "district" && activeRegion.state_name && (
            <div style={{ fontSize: "11px", color: "#6B7E90", marginTop: "2px" }}>
              {activeRegion.state_name}
            </div>
          )}
        </div>
        <button
          onClick={() => setActiveRegion(null)}
          title="Close"
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            color: "#6B7E90",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
            padding: "2px 4px",
          }}
        >
          ×
        </button>
      </div>

      {/* Layer selector */}
      {layerOrder.length > 1 && (
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <label style={{ fontSize: "11px", color: "#6B7E90", display: "block", marginBottom: "4px" }}>
            LAYER
          </label>
          <select
            value={selectedSlug}
            onChange={(e) => {
              setSelectedSlug(e.target.value);
              setSelectedPeriod("");
            }}
            style={{
              width: "100%",
              background: "#0D1420",
              border: "1px solid #1E2D3D",
              borderRadius: "6px",
              color: "#CBD5E1",
              fontSize: "12px",
              padding: "6px 8px",
            }}
          >
            {layerOrder.map((slug) => {
              const label = availableLayers.find((l) => l.slug === slug)?.label ?? slug;
              return (
                <option key={slug} value={slug}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Period selector */}
      {availablePeriods.length > 1 && (
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <label style={{ fontSize: "11px", color: "#6B7E90", display: "block", marginBottom: "4px" }}>
            PERIOD
          </label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{
              width: "100%",
              background: "#0D1420",
              border: "1px solid #1E2D3D",
              borderRadius: "6px",
              color: "#CBD5E1",
              fontSize: "12px",
              padding: "6px 8px",
            }}
          >
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, padding: "12px 16px", overflowY: "auto" }}>
        {loading && (
          <div>
            {STAT_ROWS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: "32px",
                  background: "#111827",
                  borderRadius: "4px",
                  marginBottom: "6px",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              color: "#6B7E90",
              fontSize: "12px",
            }}
          >
            {error}
          </div>
        )}

        {!loading && stats && (
          <>
            {/* Layer label as subtitle */}
            <div style={{ fontSize: "11px", color: "#6B7E90", marginBottom: "10px" }}>
              {regionLabel}
              {stats.period_label && (
                <span style={{ marginLeft: "6px", color: "#4B6B8A" }}>· {stats.period_label}</span>
              )}
            </div>

            {/* Stats grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
                marginBottom: "14px",
              }}
            >
              {STAT_ROWS.map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    background: "#111827",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    border: "1px solid #1E2D3D",
                  }}
                >
                  <div style={{ fontSize: "10px", color: "#6B7E90", marginBottom: "2px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#E2E8F0" }}>
                    {fmt(stats[key] as number | null)}
                  </div>
                </div>
              ))}
            </div>

            {/* Histogram */}
            {stats.histogram?.bins && stats.histogram?.counts && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", color: "#6B7E90", marginBottom: "6px" }}>
                  DISTRIBUTION
                </div>
                <Histogram bins={stats.histogram.bins} counts={stats.histogram.counts} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: export links */}
      {!loading && !error && stats && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid #1E2D3D",
            display: "flex",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <a
            href={buildExportUrl({ ...exportBase, scope: "region" })}
            download
            style={{
              flex: 1,
              textAlign: "center",
              padding: "7px 0",
              borderRadius: "6px",
              background: "#1E2D3D",
              color: "#8B5CF6",
              fontSize: "11px",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid #2A3D50",
            }}
          >
            Export Region CSV
          </a>
          <a
            href={buildExportUrl({ ...exportBase, scope: "all" })}
            download
            style={{
              flex: 1,
              textAlign: "center",
              padding: "7px 0",
              borderRadius: "6px",
              background: "#1E2D3D",
              color: "#6B7E90",
              fontSize: "11px",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid #2A3D50",
            }}
          >
            Export All CSV
          </a>
        </div>
      )}
    </div>
  );
}
