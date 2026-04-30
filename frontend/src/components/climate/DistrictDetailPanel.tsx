import { useState, useEffect } from "react";
import { useStore } from "../../store";
import SOIComparisonChart from "./SOIComparisonChart";
import ReturnPeriodChart from "./ReturnPeriodChart";
import type { TeleconnectionName, SeasonalSOIKey, SeasonalDMIKey } from "../../types/climate.types";

type CorrSeason = "Annual" | "DJF" | "MAM" | "JJA" | "SON";
type CorrTC = "SOI" | "DMI";
type ActiveTab = "overview" | "series" | "teleconnections" | "returnperiods";

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

function rColor(r: number | null, sig: boolean): string {
  if (r === null) return "text-slate-700";
  if (!sig) return "text-slate-500";
  return r > 0 ? "text-red-400" : "text-sky-400";
}

function rBarColor(r: number | null, sig: boolean): string {
  if (r === null || !sig) return "bg-slate-600";
  return r > 0 ? "bg-red-500" : "bg-sky-500";
}

function CorrCard({ tc, season, setSeason, correlations }: CorrCardProps) {
  const isSOI = tc === "SOI";
  const accentColor = isSOI ? "text-violet-400" : "text-teal-400";
  const accentDot = isSOI ? "bg-violet-500" : "bg-teal-500";
  const accentActive = isSOI ? "bg-violet-700/70 border-violet-600 text-white" : "bg-teal-700/70 border-teal-600 text-white";
  const info = correlations?.[corrKey(tc, season)];

  // Collect all-season r values for the overview grid
  const allSeasonData = CORR_SEASONS.map((s) => {
    const d = correlations?.[corrKey(tc, s)];
    const r = d?.r ?? null;
    const sig = r !== null && Math.abs(r) > 0.3;
    return { s, r, sig, hasData: !!d };
  });

  return (
    <div>
      {/* Header */}
      <div className="px-3.5 pt-2.5 pb-2.5 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-2.5">
          <div className={`w-1.5 h-1.5 rounded-full ${accentDot}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${accentColor}`}>
            {isSOI ? "ENSO / SOI Correlation" : "IOD / DMI Correlation"}
          </span>
        </div>

        {/* Season tabs — color-coded by r magnitude */}
        <div className="flex gap-1 p-0.5 bg-slate-900/80 rounded-lg">
          {allSeasonData.map(({ s, r, sig, hasData }) => {
            const active = season === s;
            return (
              <button
                key={s}
                onClick={() => hasData && setSeason(s)}
                className={[
                  "flex-1 flex flex-col items-center pt-1 pb-1.5 rounded-md text-[10px] font-medium transition-all gap-0.5",
                  active
                    ? `${accentActive} shadow-sm border`
                    : hasData
                    ? "text-slate-400 hover:text-slate-200 border border-transparent"
                    : "text-slate-700 cursor-not-allowed border border-transparent",
                ].join(" ")}
              >
                <span>{s}</span>
                {/* Mini r-bar indicator */}
                <div className="w-full px-1.5 h-1 relative">
                  <div className="h-full rounded-full bg-slate-700/60 overflow-hidden relative">
                    {r !== null && hasData && (
                      <div
                        className={`absolute top-0 bottom-0 rounded-full transition-all ${rBarColor(r, sig)}`}
                        style={{
                          left: r >= 0 ? "50%" : `${50 - Math.abs(r) * 50}%`,
                          width: `${Math.abs(r) * 50}%`,
                          opacity: sig ? 1 : 0.4,
                        }}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {!info ? (
          <p className="text-xs text-slate-600 text-center py-3">
            No data for {season} season.
          </p>
        ) : (() => {
          const r = info.r;
          const sig = r !== null && Math.abs(r) > 0.3;
          const pct = r !== null ? Math.abs(r) * 50 : 0;

          return (
            <>
              {/* Big r readout */}
              <div className="flex items-center gap-3">
                <span className={`text-4xl font-mono font-bold tabular-nums leading-none ${rColor(r, sig)}`}>
                  {r !== null ? (r >= 0 ? "+" : "") + r.toFixed(3) : "—"}
                </span>
                <div className="flex flex-col gap-1">
                  {sig && (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/60 rounded-md px-1.5 py-0.5 leading-none">
                      Significant
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    Pearson r · |r| &gt; 0.3 threshold
                  </span>
                </div>
              </div>

              {/* Gauge */}
              <div>
                <div className="relative h-5 bg-slate-900 rounded-full overflow-hidden">
                  {/* Scale markers at ±0.5 */}
                  <div className="absolute top-1 bottom-1 left-[25%] w-px bg-slate-700/60" />
                  <div className="absolute top-1 bottom-1 left-[75%] w-px bg-slate-700/60" />
                  {/* Centre line */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600 z-10" />
                  {r !== null && (
                    <div
                      className={`absolute top-1.5 bottom-1.5 rounded-full transition-all ${r >= 0 ? "bg-red-500" : "bg-sky-500"}`}
                      style={{
                        left: r >= 0 ? "50%" : `${50 - pct}%`,
                        width: `${pct}%`,
                        opacity: sig ? 0.85 : 0.35,
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-slate-600">−1</span>
                  <span className="text-[9px] text-slate-600">−0.5</span>
                  <span className="text-[9px] text-slate-500 font-medium">0</span>
                  <span className="text-[9px] text-slate-600">+0.5</span>
                  <span className="text-[9px] text-slate-600">+1</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  {isSOI ? (
                    <>
                      <span className="text-[9px] text-sky-700">La Niña</span>
                      <span className="text-[9px] text-red-800">El Niño</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] text-sky-700">Neg. IOD</span>
                      <span className="text-[9px] text-red-800">Pos. IOD</span>
                    </>
                  )}
                </div>
              </div>

              {/* All-season overview */}
              {/* <div className="border border-slate-700/60 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 bg-slate-900/40 border-b border-slate-700/60">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">All Seasons</span>
                </div>
                <div className="grid grid-cols-4 divide-x divide-slate-700/60">
                  {allSeasonData.map(({ s, r: rv, sig: sv, hasData }) => {
                    const isActive = s === season;
                    return (
                      <button
                        key={s}
                        onClick={() => hasData && setSeason(s)}
                        className={[
                          "flex flex-col items-center py-2 px-1 gap-1 transition-colors",
                          isActive ? "bg-slate-700/40" : hasData ? "hover:bg-slate-700/20" : "cursor-default",
                        ].join(" ")}
                      >
                        <span className={`text-[9px] font-semibold uppercase ${isActive ? accentColor : "text-slate-500"}`}>{s}</span>
                        <span className={`text-[11px] font-mono tabular-nums font-semibold leading-none ${rColor(rv, sv)}`}>
                          {rv !== null ? (rv >= 0 ? "+" : "") + rv.toFixed(2) : "—"}
                        </span>
                        <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden relative">
                          {rv !== null && hasData && (
                            <div
                              className={`absolute top-0 bottom-0 rounded-full ${rBarColor(rv, sv)}`}
                              style={{
                                left: rv >= 0 ? "50%" : `${50 - Math.abs(rv) * 50}%`,
                                width: `${Math.abs(rv) * 50}%`,
                                opacity: sv ? 0.9 : 0.35,
                              }}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div> */}

              {/* Footnote */}
              {info.n_years != null && (
                <p className="text-[10px] text-slate-600 border-t border-slate-700/60 pt-2.5">
                  n = {info.n_years} years
                  {info.period ? ` · ${info.period[0]}–${info.period[1]}` : ""}
                  {` · ${season} season`}
                </p>
              )}
            </>
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
    { id: "overview",         label: "Overview" },
    { id: "series",           label: "Time Series" },
    { id: "teleconnections",  label: "Teleconnections" },
    { id: "returnperiods",    label: "Return Periods" },
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

          {/* TELECONNECTIONS */}
          {activeTab === "teleconnections" && (
            <div className="py-3 px-3">
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden divide-y divide-slate-700">
                <CorrCard tc="SOI" season={soiSeason} setSeason={setSoiSeason} correlations={indexProfile.correlations} />
                <CorrCard tc="DMI" season={dmiSeason} setSeason={setDmiSeason} correlations={indexProfile.correlations} />
              </div>
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

                {(indexProfile.return_periods || indexProfile.gev_params) ? (
                  <>
                    {indexProfile.return_periods && (
                      <div className="grid grid-cols-4 divide-x divide-slate-700/60 border-b border-slate-700">
                        {([
                          { rp: 10,  accent: "text-sky-400",    dot: "bg-sky-500"    },
                          { rp: 25,  accent: "text-emerald-400", dot: "bg-emerald-500" },
                          { rp: 50,  accent: "text-amber-400",  dot: "bg-amber-500"  },
                          { rp: 100, accent: "text-rose-400",   dot: "bg-rose-500"   },
                        ] as const).map(({ rp, accent, dot }) => {
                          const key = `rp_${rp}` as keyof typeof indexProfile.return_periods;
                          const val = indexProfile.return_periods?.[key];
                          return (
                            <div key={rp} className="flex flex-col items-center py-3 px-2 gap-0.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${dot} opacity-80`} />
                                <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                                  {rp}yr
                                </span>
                              </div>
                              <span className={`text-sm font-mono font-bold tabular-nums ${val != null ? accent : "text-slate-700"}`}>
                                {val != null ? (val as number).toFixed(1) : "—"}
                              </span>
                              <span className="text-[9px] text-slate-600">{indexProfile.units}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="px-3 pt-2 pb-4" style={{ height: 320 }}>
                      <ReturnPeriodChart
                        returnPeriods={indexProfile.return_periods}
                        gevParams={indexProfile.gev_params}
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
