import { useEffect } from "react";
import { Link } from "react-router-dom";
import { interpolateRdYlBu, interpolateYlOrRd } from "d3-scale-chromatic";
import { useStore } from "../../store";
import IndexSelector from "./IndexSelector";
import MetricToggle from "./MetricToggle";
import ClimateMap from "./ClimateMap";
import DistrictDetailPanel from "./DistrictDetailPanel";

const COLORMAPS: Record<string, (t: number) => string> = {
  RdYlBu_r: (t) => interpolateRdYlBu(1 - t),
  YlOrRd: interpolateYlOrRd,
  default: interpolateYlOrRd,
};

function getColor(value: number, min: number, max: number, colormap: string): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const clampedT = Math.max(0, Math.min(1, t));
  const fn = COLORMAPS[colormap] ?? COLORMAPS.default;
  return fn(clampedT);
}

function RankingsPanel() {
  const rankings = useStore((s) => s.rankings);
  const rankingsLoading = useStore((s) => s.rankingsLoading);
  const fetchRankings = useStore((s) => s.fetchRankings);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedMetric = useStore((s) => s.selectedMetric);

  useEffect(() => {
    fetchRankings();
  }, [selectedIndex, selectedMetric]);

  const metricLabel: Record<string, string> = {
    trend_slope:   "Trend (per decade)",
    latest_value:  "Year Value",
    corr_soi:      "SOI Corr. · Annual",
    corr_soi_djf:  "SOI Corr. · DJF",
    corr_soi_mam:  "SOI Corr. · MAM",
    corr_soi_jja: "SOI Corr. · JJA",
    corr_soi_son: "SOI Corr. · SON",
  };

  const medalClass = (rank: number) => {
    if (rank === 1) return "bg-yellow-400 text-yellow-900";
    if (rank === 2) return "bg-slate-300 text-slate-700";
    if (rank === 3) return "bg-orange-400 text-orange-900";
    return "bg-slate-100 text-slate-500";
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <p className="text-xs font-semibold text-slate-600">
          Rankings —{" "}
          <span className="font-mono text-blue-700">{selectedIndex}</span>
          <span className="text-slate-400 ml-1">/ {metricLabel[selectedMetric] ?? selectedMetric}</span>
        </p>
        {rankingsLoading && (
          <span className="text-xs text-slate-400 animate-pulse">Loading…</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {rankings.length === 0 && !rankingsLoading && (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            No ranking data available for this selection.
          </div>
        )}
        {rankings.length > 0 && (
          <div>
            {rankings.map((row) => (
              <div
                key={row.district_code}
                className="flex items-center gap-3 px-4 py-3 border-l-2 border-l-transparent hover:border-l-blue-400 hover:bg-blue-50 cursor-pointer transition-all border-b border-slate-50"
                onClick={() => fetchDistrictProfile(row.district_code)}
              >
                <div
                  className={[
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                    medalClass(row.rank),
                  ].join(" ")}
                >
                  {row.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{row.district_name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{row.state_name}</p>
                </div>
                <span className="text-xs font-mono text-slate-700 tabular-nums shrink-0">
                  {row.value !== null ? row.value.toFixed(3) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClimateExploreApp() {
  const fetchAvailableIndices = useStore((s) => s.fetchAvailableIndices);
  const selectedLevel = useStore((s) => s.selectedLevel);
  const setSelectedLevel = useStore((s) => s.setSelectedLevel);
  const selectedDistrictCode = useStore((s) => s.selectedDistrictCode);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedMetric = useStore((s) => s.selectedMetric);
  const choroData = useStore((s) => s.choroData);

  useEffect(() => {
    fetchAvailableIndices();
  }, []);

  const values = choroData?.features
    .map((f) => f.properties.value)
    .filter((v): v is number => v !== null) ?? [];
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;
  const colormap =
    selectedMetric === "trend_slope" || selectedMetric.startsWith("corr_")
      ? "RdYlBu_r"
      : "YlOrRd";

  const metricLabel: Record<string, string> = {
    trend_slope:   "Trend",
    latest_value:  "Year Value",
    corr_soi:      "SOI · Annual",
    corr_soi_djf:  "SOI · DJF",
    corr_soi_mam:  "SOI · MAM",
    corr_soi_jja: "SOI · JJA",
    corr_soi_son: "SOI · SON",
  };

  return (
    <div className="flex flex-row h-screen overflow-hidden bg-slate-50">
      {/* Left Sidebar */}
      <aside className="w-[260px] shrink-0 h-screen flex flex-col bg-white border-r border-slate-200 shadow-sm overflow-y-auto">
        {/* App header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              IG
            </div>
            <span className="text-sm font-bold text-slate-800">IndiGIS</span>
          </div>
          <p className="text-xs text-slate-500 mb-2">Climate Explorer</p>
          <Link
            to="/"
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>

        {/* INDEX section */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Index
          </p>
          <IndexSelector />
        </div>

        {/* VIEW section */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            View
          </p>
          <MetricToggle />
        </div>

        {/* LEVEL section */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Level
          </p>
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
            {(["district", "state"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLevel(l)}
                className={[
                  "flex-1 px-3 py-1.5 rounded-md text-xs transition-all",
                  selectedLevel === l
                    ? "font-semibold bg-white text-slate-800 shadow-sm border border-slate-200"
                    : "font-medium text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>

      </aside>

      {/* Center Map */}
      <main className="flex-1 min-w-0 h-screen relative">
        <ClimateMap />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[800] bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1 shadow-sm text-xs pointer-events-none text-slate-600">
          {selectedIndex} · {metricLabel[selectedMetric] ?? selectedMetric} ·{" "}
          {selectedLevel.charAt(0).toUpperCase() + selectedLevel.slice(1)}
        </div>

        {/* Floating color scale legend */}
        {values.length > 0 && (
          <div className="absolute bottom-6 right-5 z-[800] pointer-events-none">
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-xl px-4 py-2.5 shadow-lg shadow-slate-900/10 flex flex-col items-center gap-1.5 min-w-[200px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 leading-none">
                {metricLabel[selectedMetric] ?? selectedMetric}
              </p>
              <div
                style={{
                  height: 7,
                  width: "100%",
                  background: `linear-gradient(to right, ${
                    [0, 0.2, 0.4, 0.6, 0.8, 1]
                      .map((t) => {
                        const v = minVal + t * (maxVal - minVal);
                        return getColor(v, minVal, maxVal, colormap);
                      })
                      .join(", ")
                  })`,
                  borderRadius: 99,
                }}
              />
              <div className="flex justify-between w-full">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">{minVal.toFixed(2)}</span>
                <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                  {((minVal + maxVal) / 2).toFixed(2)}
                </span>
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">{maxVal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Right Panel */}
      <aside className="w-[460px] shrink-0 h-screen flex flex-col bg-white border-l border-slate-200 shadow-sm overflow-hidden">
        {selectedDistrictCode ? <DistrictDetailPanel /> : <RankingsPanel />}
      </aside>
    </div>
  );
}
