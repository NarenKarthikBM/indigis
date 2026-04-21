import { useState, useEffect } from "react";
import { useStore } from "../../store";
import SOIComparisonChart from "./SOIComparisonChart";
import ReturnPeriodChart from "./ReturnPeriodChart";
import type { TeleconnectionName, SeasonalSOIKey, SeasonalDMIKey } from "../../types/climate.types";

type CorrSeason = "Annual" | "DJF" | "MAM" | "JJA" | "SON";
type CorrTC = "SOI" | "DMI";
type ActiveTab = "overview" | "series" | "soi" | "iod" | "returnperiods";

// All seasons (including Annual) used for computing best-r stats in Overview
const ALL_SEASONS: CorrSeason[] = ["Annual", "DJF", "MAM", "JJA", "SON"];
// Seasons shown in the UI selectors (Annual removed per design)
const CORR_SEASONS: CorrSeason[] = ["DJF", "MAM", "JJA", "SON"];

function corrKey(tc: CorrTC, season: CorrSeason): TeleconnectionName | SeasonalSOIKey | SeasonalDMIKey {
  if (tc === "SOI") return season === "Annual" ? "SOI" : (`SOI_${season}` as SeasonalSOIKey);
  return season === "Annual" ? "DMI" : (`DMI_${season}` as SeasonalDMIKey);
}

function TrendMiniBar({ slope }: { slope: number | null }) {
  if (slope === null) return <div className="w-12 h-1.5 bg-slate-700 rounded-full" />;
  const pct = Math.min(Math.abs(slope) * 50, 52);
  return (
    <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden relative shrink-0">
      <div
        className={slope > 0 ? "bg-red-500 h-full rounded-full" : "bg-blue-500 h-full rounded-full"}
        style={{ width: `${pct}px` }}
      />
    </div>
  );
}

interface CorrCardProps {
  tc: CorrTC;
  season: CorrSeason;
  setSeason: (s: CorrSeason) => void;
  correlations: ReturnType<typeof Object.fromEntries> | null | undefined;
}

function CorrCard({ tc, season, setSeason, correlations }: CorrCardProps) {
  const isSOI = tc === "SOI";
  const dotColor = isSOI ? "bg-violet-500" : "bg-teal-500";
  const headerColor = isSOI ? "text-violet-400" : "text-teal-400";
  const info = correlations?.[corrKey(tc, season)];

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-3.5 pt-2.5 pb-2 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${headerColor}`}>
              {isSOI ? "SOI Correlation" : "IOD / DMI Correlation"}
            </span>
          </div>
          <span className="text-[10px] text-slate-600">* |r| &gt; 0.3</span>
        </div>
        <div className="flex gap-1 p-0.5 bg-slate-900 rounded-lg">
          {CORR_SEASONS.map((s) => {
            const hasData = !!(correlations?.[corrKey(tc, s)]);
            const active = season === s;
            return (
              <button
                key={s}
                onClick={() => hasData && setSeason(s)}
                className={[
                  "flex-1 py-1 rounded-md text-[10px] font-medium transition-all",
                  active
                    ? "bg-slate-700 text-white shadow-sm border border-slate-600"
                    : hasData
                    ? "text-slate-400 hover:text-slate-200"
                    : "text-slate-700 cursor-not-allowed",
                ].join(" ")}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4">
        {!info ? (
          <p className="text-xs text-slate-600 text-center py-3">
            No data for {season === "Annual" ? "annual" : season} season.
          </p>
        ) : (() => {
          const r = info.r;
          const sig = r !== null && Math.abs(r) > 0.3;
          return (
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <span className={[
                  "text-3xl font-mono font-bold tabular-nums leading-none",
                  r === null ? "text-slate-700"
                    : sig ? r > 0 ? "text-red-400" : "text-blue-400"
                    : "text-slate-500",
                ].join(" ")}>
                  {r !== null ? (r >= 0 ? "+" : "") + r.toFixed(3) : "-"}
                </span>
                <div className="pb-1 flex flex-col gap-0.5">
                  {sig && (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/60 rounded px-1.5 py-0.5 leading-none">
                      Significant
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600">Pearson r</span>
                </div>
              </div>

              <div>
                <div className="h-4 bg-slate-900 rounded-full overflow-hidden relative">
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-700 z-10" />
                  {r !== null && (
                    <div
                      className={["absolute top-1 bottom-1 rounded-full", r >= 0 ? "bg-red-500" : "bg-blue-500"].join(" ")}
                      style={{
                        left: r >= 0 ? "50%" : `${50 - Math.abs(r) * 50}%`,
                        width: `${Math.abs(r) * 50}%`,
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-slate-600">
                  {isSOI ? (
                    <><span>← La Niña (neg)</span><span>(pos) El Niño →</span></>
                  ) : (
                    <><span>← Negative IOD</span><span>Positive IOD →</span></>
                  )}
                </div>
              </div>

              {info.n_years != null && (
                <p className="text-[10px] text-slate-600 border-t border-slate-700 pt-2">
                  n = {info.n_years} years
                  {info.period ? ` · ${info.period[0]}–${info.period[1]}` : ""}
                  {season !== "Annual" ? ` · ${season} season` : " · Annual"}
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function DistrictDetailPanel() {
  const selectedDistrictCode = useStore((s) => s.selectedDistrictCode);
  const districtProfile = useStore((s) => s.districtProfile);
  const profileLoading = useStore((s) => s.profileLoading);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);
  const setSelectedDistrict = useStore((s) => s.setSelectedDistrict);
  const selectedIndex = useStore((s) => s.selectedIndex);

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [soiSeason, setSoiSeason] = useState<CorrSeason>("DJF");
  const [dmiSeason, setDmiSeason] = useState<CorrSeason>("DJF");

  useEffect(() => {
    setActiveTab("overview");
  }, [selectedDistrictCode, selectedIndex]);

  useEffect(() => {
    if (selectedDistrictCode) fetchDistrictProfile(selectedDistrictCode);
  }, [selectedDistrictCode]);

  if (!selectedDistrictCode) return null;

  const indexProfile = districtProfile?.indices[selectedIndex];
  const district = districtProfile?.district;

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: "overview",      label: "Overview" },
    { id: "series",        label: "Time Series" },
    { id: "soi",           label: "SOI" },
    { id: "iod",           label: "IOD" },
    { id: "returnperiods", label: "Return Periods" },
  ];

  const soiCorrs = ALL_SEASONS.map((s) => indexProfile?.correlations?.[corrKey("SOI", s)]?.r)
    .filter((r): r is number => r !== null && r !== undefined);
  const dmiCorrs = ALL_SEASONS.map((s) => indexProfile?.correlations?.[corrKey("DMI", s)]?.r)
    .filter((r): r is number => r !== null && r !== undefined);
  const bestSoiR = soiCorrs.length > 0 ? soiCorrs.reduce((a, b) => Math.abs(a) > Math.abs(b) ? a : b) : null;
  const bestDmiR = dmiCorrs.length > 0 ? dmiCorrs.reduce((a, b) => Math.abs(a) > Math.abs(b) ? a : b) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1 h-9 rounded-full bg-blue-500 shrink-0" />
          <div className="min-w-0">
            {district ? (
              <>
                <p className="font-semibold text-slate-100 text-sm leading-tight truncate">{district.name}</p>
                <p className="text-[11px] text-slate-500 leading-tight">{district.state_name}</p>
              </>
            ) : (
              <p className="font-semibold text-slate-500 text-sm">Loading…</p>
            )}
          </div>
          <span className="ml-1 text-[11px] font-mono font-semibold bg-blue-600 text-white px-2 py-0.5 rounded shrink-0">
            {selectedIndex}
          </span>
        </div>
        <button
          onClick={() => setSelectedDistrict(null)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-200 hover:bg-slate-700 transition-colors shrink-0 ml-2"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-800 bg-slate-900 shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "px-3 py-2.5 text-[11px] font-medium whitespace-nowrap border-b-2 transition-all",
              activeTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {profileLoading && (
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-3">
          {[80, 48, 60, 180].map((h, i) => (
            <div key={i} className="bg-slate-800 rounded-xl animate-pulse" style={{ height: h }} />
          ))}
        </div>
      )}

      {/* No data */}
      {!profileLoading && !indexProfile && districtProfile && (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm px-6 text-center">
          No data for <span className="font-mono text-slate-500 mx-1">{selectedIndex}</span> in this district.
        </div>
      )}

      {/* Tab content */}
      {!profileLoading && indexProfile && (
        <div className="flex-1 overflow-y-auto">

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="py-3 space-y-3 px-3">
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-y divide-slate-700">
                  {/* Latest Value */}
                  <div className="px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Latest Value</p>
                    <p className="text-lg font-mono font-bold text-slate-100 tabular-nums leading-none">
                      {indexProfile.latest_value !== null ? indexProfile.latest_value.toFixed(2) : "-"}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{indexProfile.units}</p>
                  </div>
                  {/* Trend */}
                  <div className="px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Trend / decade</p>
                    <p className={[
                      "text-lg font-mono font-bold tabular-nums leading-none",
                      indexProfile.trend?.slope != null
                        ? indexProfile.trend.slope > 0 ? "text-red-400" : "text-blue-400"
                        : "text-slate-700",
                    ].join(" ")}>
                      {indexProfile.trend?.slope != null
                        ? `${indexProfile.trend.slope > 0 ? "+" : ""}${indexProfile.trend.slope.toFixed(3)}`
                        : "-"}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{indexProfile.trend?.units ?? indexProfile.units}</p>
                  </div>
                  {/* Best SOI r */}
                  <div className="px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Best SOI r</p>
                    <p className={[
                      "text-lg font-mono font-bold tabular-nums leading-none",
                      bestSoiR != null ? Math.abs(bestSoiR) > 0.3 ? bestSoiR > 0 ? "text-red-400" : "text-blue-400" : "text-slate-400" : "text-slate-700",
                    ].join(" ")}>
                      {bestSoiR != null ? `${bestSoiR > 0 ? "+" : ""}${bestSoiR.toFixed(3)}` : "-"}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Pearson r</p>
                  </div>
                  {/* Best IOD r */}
                  <div className="px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Best IOD r</p>
                    <p className={[
                      "text-lg font-mono font-bold tabular-nums leading-none",
                      bestDmiR != null ? Math.abs(bestDmiR) > 0.3 ? bestDmiR > 0 ? "text-red-400" : "text-blue-400" : "text-slate-400" : "text-slate-700",
                    ].join(" ")}>
                      {bestDmiR != null ? `${bestDmiR > 0 ? "+" : ""}${bestDmiR.toFixed(3)}` : "-"}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Pearson r</p>
                  </div>
                </div>
              </div>

              {/* Trends across indices */}
              {districtProfile && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Trends (per decade)</span>
                    </div>
                    <span className="text-[10px] text-slate-600">* p &lt; 0.05</span>
                  </div>
                  <div className="px-1 py-1.5">
                    {Object.entries(districtProfile.indices).map(([name, profile]) => {
                      const slope = profile.trend?.slope ?? null;
                      const pVal = profile.trend?.p_value ?? null;
                      const sig = pVal !== null && pVal < 0.05;
                      const isCurrent = name === selectedIndex;
                      return (
                        <div
                          key={name}
                          className={["flex items-center justify-between px-3 py-2 rounded-lg transition-colors", isCurrent ? "bg-blue-950/40" : "hover:bg-slate-700/40"].join(" ")}
                        >
                          <span className={["font-mono text-xs w-14 shrink-0", isCurrent ? "text-blue-400 font-semibold" : "text-slate-500"].join(" ")}>
                            {name}
                          </span>
                          <div className="flex items-center gap-2">
                            <TrendMiniBar slope={slope} />
                            {slope !== null ? (
                              <span className={["font-mono text-xs tabular-nums w-16 text-right", slope > 0 ? "text-red-400" : "text-blue-400", sig ? "font-semibold" : ""].join(" ")}>
                                {slope > 0 ? "+" : ""}{slope.toFixed(3)}
                                {sig && <span className="text-amber-500 ml-0.5">*</span>}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-700 w-16 text-right">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="h-2" />
            </div>
          )}

          {/* TIME SERIES */}
          {activeTab === "series" && (
            <div className="py-3 px-3">
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Time Series</span>
                  </div>
                </div>
                <div className="px-3 pt-2 pb-4" style={{ height: 700 }}>
                  <SOIComparisonChart
                    data={indexProfile.time_series}
                    trend={indexProfile.trend}
                    units={indexProfile.units}
                    indexName={selectedIndex}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SOI */}
          {activeTab === "soi" && (
            <div className="py-3 px-3">
              <CorrCard tc="SOI" season={soiSeason} setSeason={setSoiSeason} correlations={indexProfile.correlations} />
            </div>
          )}

          {/* IOD */}
          {activeTab === "iod" && (
            <div className="py-3 px-3">
              <CorrCard tc="DMI" season={dmiSeason} setSeason={setDmiSeason} correlations={indexProfile.correlations} />
            </div>
          )}

          {/* RETURN PERIODS */}
          {activeTab === "returnperiods" && (
            <div className="py-3 px-3">
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-700">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GEV Return Periods</span>
                </div>

                {indexProfile.return_periods ? (
                  <>
                    <div className="grid grid-cols-4 divide-x divide-slate-700 border-b border-slate-700">
                      {([10, 25, 50, 100] as const).map((rp) => {
                        const key = `rp_${rp}` as keyof typeof indexProfile.return_periods;
                        const val = indexProfile.return_periods?.[key];
                        return (
                          <div key={rp} className="flex flex-col items-center py-3 px-2">
                            <span className="text-[9px] font-semibold text-slate-500 uppercase mb-1">RP-{rp}</span>
                            <span className="text-sm font-mono font-bold text-slate-200 tabular-nums">
                              {val != null ? (val as number).toFixed(1) : "-"}
                            </span>
                            <span className="text-[9px] text-slate-600">{indexProfile.units}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3 pt-2 pb-3" style={{ height: 220 }}>
                      <ReturnPeriodChart
                        returnPeriods={indexProfile.return_periods}
                        timeSeries={indexProfile.time_series}
                        units={indexProfile.units}
                        indexName={selectedIndex}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-10 text-slate-600 text-sm">
                    No return period data for <span className="font-mono text-slate-500 mx-1">{selectedIndex}</span>.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
