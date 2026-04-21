import { useEffect, useMemo, useState } from "react";
import { interpolateRdYlBu, interpolateYlOrRd } from "d3-scale-chromatic";
import { useStore } from "../../store";
import IndexSelector, { CATEGORY } from "./IndexSelector";
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

const METRIC_LABELS: Record<string, string> = {
  trend_slope:   "Trend (per decade)",
  latest_value:  "Annual Value",
  corr_soi:      "SOI Corr. · Annual",
  corr_soi_djf:  "SOI Corr. · DJF",
  corr_soi_mam:  "SOI Corr. · MAM",
  corr_soi_jja:  "SOI Corr. · JJA",
  corr_soi_son:  "SOI Corr. · SON",
  corr_iod:      "IOD Corr. · Annual",
  corr_iod_djf:  "IOD Corr. · DJF",
  corr_iod_mam:  "IOD Corr. · MAM",
  corr_iod_jja:  "IOD Corr. · JJA",
  corr_iod_son:  "IOD Corr. · SON",
};

function RankingsPanel() {
  const rankings = useStore((s) => s.rankings);
  const rankingsLoading = useStore((s) => s.rankingsLoading);
  const fetchRankings = useStore((s) => s.fetchRankings);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedMetric = useStore((s) => s.selectedMetric);
  const selectedLevel = useStore((s) => s.selectedLevel);
  const availableIndices = useStore((s) => s.availableIndices);

  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    fetchRankings();
  }, [selectedIndex, selectedMetric]);

  const indexMeta = availableIndices.find((i) => i.name === selectedIndex);
  const units = indexMeta?.units ?? "";

  const isDiverging =
    selectedMetric === "trend_slope" || selectedMetric.startsWith("corr_");

  const sortedRankings = useMemo(() => {
    const copy = [...rankings];
    copy.sort((a, b) => {
      const av = a.value ?? 0;
      const bv = b.value ?? 0;
      return sortDesc ? bv - av : av - bv;
    });
    return copy;
  }, [rankings, sortDesc]);

  const validValues = sortedRankings
    .map((r) => r.value)
    .filter((v): v is number => v !== null);
  const minRankVal = validValues.length ? Math.min(...validValues) : 0;
  const maxRankVal = validValues.length ? Math.max(...validValues) : 1;
  const rangeRank = maxRankVal - minRankVal || 1;

  const medalClass = (rank: number) => {
    if (rank === 1) return "bg-yellow-500 text-yellow-950";
    if (rank === 2) return "bg-slate-500 text-slate-950";
    if (rank === 3) return "bg-orange-500 text-orange-950";
    return "bg-slate-700 text-slate-400";
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <div>
          <p className="text-xs font-semibold text-slate-300">
            <span className="font-mono text-blue-400">{selectedIndex}</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-slate-400">{METRIC_LABELS[selectedMetric] ?? selectedMetric}</span>
          </p>
          <p className="text-[10px] text-slate-600 mt-0.5">
            {rankingsLoading ? (
              <span className="animate-pulse text-slate-500">Loading…</span>
            ) : (
              <>
                {sortedRankings.length} {selectedLevel}s
                {units && <span className="ml-1 font-mono">· {units}</span>}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setSortDesc((d) => !d)}
          title={sortDesc ? "Sorted high → low" : "Sorted low → high"}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors text-sm"
        >
          {sortDesc ? "↓" : "↑"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedRankings.length === 0 && !rankingsLoading && (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm px-4 text-center">
            No ranking data for this selection.
          </div>
        )}
        {sortedRankings.map((row, idx) => {
          const v = row.value;
          const displayRank = idx + 1;

          let barEl: React.ReactNode = null;
          if (v !== null) {
            if (isDiverging) {
              const halfPct = Math.min(Math.abs(v) * 50, 50);
              const isPos = v >= 0;
              barEl = (
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden relative mt-1 ml-9">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600 z-10" />
                  <div
                    className={isPos ? "absolute top-0 bottom-0 bg-red-500 rounded-full" : "absolute top-0 bottom-0 bg-blue-500 rounded-full"}
                    style={{ left: isPos ? "50%" : `${50 - halfPct}%`, width: `${halfPct}%` }}
                  />
                </div>
              );
            } else {
              const seqPct = Math.max(4, ((v - minRankVal) / rangeRank) * 100);
              barEl = (
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1 ml-9">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${seqPct}%` }} />
                </div>
              );
            }
          }

          return (
            <div
              key={row.district_code}
              className="px-4 py-2.5 border-l-2 border-l-transparent hover:border-l-blue-500 hover:bg-slate-800/60 cursor-pointer transition-all border-b border-slate-800/60"
              onClick={() => fetchDistrictProfile(row.district_code)}
            >
              <div className="flex items-center gap-3">
                <div className={["w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", medalClass(displayRank)].join(" ")}>
                  {displayRank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{row.district_name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{row.state_name}</p>
                </div>
                <span className="text-xs font-mono text-slate-300 tabular-nums shrink-0">
                  {v !== null ? v.toFixed(3) : "-"}
                </span>
              </div>
              {barEl}
            </div>
          );
        })}
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
  const availableIndices = useStore((s) => s.availableIndices);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchAvailableIndices();
  }, []);

  const matches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return (choroData?.features ?? [])
      .filter((f) => f.properties.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 8);
  }, [searchQuery, choroData]);

  const values = choroData?.features
    .map((f) => f.properties.value)
    .filter((v): v is number => v !== null) ?? [];
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;
  const colormap =
    selectedMetric === "trend_slope" || selectedMetric.startsWith("corr_")
      ? "RdYlBu_r"
      : "YlOrRd";

  const activeIndexMeta = availableIndices.find((i) => i.name === selectedIndex);
  const isWarm = CATEGORY[selectedIndex] === "warm";

  return (
    <div className="flex flex-row h-screen overflow-hidden bg-slate-950">
      {/* Left Sidebar */}
      <aside className="w-[260px] shrink-0 h-screen flex flex-col bg-slate-900 border-r border-slate-800 overflow-hidden">

        {/* App header */}
        <div className="px-4 pt-3 pb-2.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span className="font-bold text-base tracking-wide">
              <span className="text-blue-400">Indi</span>
              <span className="text-violet-400">GIS</span>
            </span>
            <span className="text-[10px] text-slate-600 ml-auto">Heat Extreme Explorer</span>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative px-3 py-2 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
            <svg className="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search districts…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-slate-600 hover:text-slate-300 text-xs leading-none">✕</button>
            )}
          </div>
          {matches.length > 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {matches.map((f) => (
                <button
                  key={f.properties.code}
                  onClick={() => { fetchDistrictProfile(f.properties.code); setSearchQuery(""); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 border-b border-slate-700/50 last:border-0 transition-colors"
                >
                  <span className="font-semibold text-slate-200">{f.properties.name}</span>
                  {f.properties.state && (
                    <span className="text-slate-500 ml-2">{f.properties.state}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          {/* INDEX section */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Index</p>
            <IndexSelector />
          </div>

          {/* VIEW section */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">View</p>
            <MetricToggle />
          </div>

          {/* LEVEL section */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Level</p>
            <div className="flex gap-1 p-0.5 bg-slate-800 rounded-lg">
              {(["district", "state"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setSelectedLevel(l)}
                  className={[
                    "flex-1 px-3 py-1.5 rounded-md text-xs transition-all",
                    selectedLevel === l
                      ? "font-semibold bg-slate-700 text-white shadow-sm border border-slate-600"
                      : "font-medium text-slate-500 hover:text-slate-300",
                  ].join(" ")}
                >
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Index Info - bottom strip */}
        {activeIndexMeta && (
          <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/50 shrink-0">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">Active Index</p>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-blue-400">{selectedIndex}</span>
              <span className={[
                "text-[9px] px-1.5 py-0.5 rounded font-medium",
                isWarm ? "bg-orange-950/60 text-orange-400" : "bg-sky-950/60 text-sky-400",
              ].join(" ")}>
                {isWarm ? "warm" : "cold"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{activeIndexMeta.description}</p>
            {(activeIndexMeta.units || activeIndexMeta.available_years.length > 0) && (
              <p className="text-[10px] text-slate-600 mt-1">
                {activeIndexMeta.units && <span className="font-mono">{activeIndexMeta.units}</span>}
                {activeIndexMeta.available_years.length > 0 && (
                  <span>
                    {activeIndexMeta.units ? " · " : ""}
                    {Math.min(...activeIndexMeta.available_years)}–{Math.max(...activeIndexMeta.available_years)}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </aside>

      {/* Center Map */}
      <main className="flex-1 min-w-0 h-screen relative">
        <ClimateMap />

        {/* Breadcrumb pill */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[800] bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-full px-3 py-1 shadow-sm text-xs pointer-events-none text-slate-400">
          <span className="text-slate-300 font-mono font-semibold">{selectedIndex}</span>
          <span className="mx-1.5 text-slate-600">·</span>
          {METRIC_LABELS[selectedMetric] ?? selectedMetric}
          <span className="mx-1.5 text-slate-600">·</span>
          {selectedLevel.charAt(0).toUpperCase() + selectedLevel.slice(1)}
        </div>

        {/* Floating color scale legend */}
        {values.length > 0 && (
          <div className="absolute bottom-6 right-5 z-[800] pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-4 py-2.5 shadow-xl flex flex-col items-center gap-1.5 min-w-[200px]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 leading-none">
                {METRIC_LABELS[selectedMetric] ?? selectedMetric}
              </p>
              <div
                style={{
                  height: 7,
                  width: "100%",
                  background: `linear-gradient(to right, ${
                    [0, 0.2, 0.4, 0.6, 0.8, 1]
                      .map((t) => getColor(minVal + t * (maxVal - minVal), minVal, maxVal, colormap))
                      .join(", ")
                  })`,
                  borderRadius: 99,
                }}
              />
              <div className="flex justify-between w-full">
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">{minVal.toFixed(2)}</span>
                <span className="text-[10px] font-mono text-slate-600 tabular-nums">{((minVal + maxVal) / 2).toFixed(2)}</span>
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">{maxVal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Right Panel */}
      <aside className="w-[460px] shrink-0 h-screen flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden">
        {selectedDistrictCode ? <DistrictDetailPanel /> : <RankingsPanel />}
      </aside>
    </div>
  );
}
