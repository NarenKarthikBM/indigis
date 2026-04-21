import { useState, useEffect } from "react";
import { useStore } from "../../store";
import SOIComparisonChart from "./SOIComparisonChart";
import type { TeleconnectionName, SeasonalSOIKey, SeasonalDMIKey } from "../../types/climate.types";

type CorrSeason = "Annual" | "DJF" | "MAM" | "JJA" | "SON";
type CorrTC = "SOI" | "DMI";
const CORR_SEASONS: CorrSeason[] = ["Annual", "DJF", "MAM", "JJA", "SON"];

function corrKey(tc: CorrTC, season: CorrSeason): TeleconnectionName | SeasonalSOIKey | SeasonalDMIKey {
  if (tc === "SOI") return season === "Annual" ? "SOI" : (`SOI_${season}` as SeasonalSOIKey);
  return season === "Annual" ? "DMI" : (`DMI_${season}` as SeasonalDMIKey);
}

function TrendMiniBar({ slope }: { slope: number | null }) {
  if (slope === null) return <div className="w-12 h-1.5 bg-slate-100 rounded-full" />;
  const pct = Math.min(Math.abs(slope) * 50, 52);
  return (
    <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden relative shrink-0">
      <div
        className={slope > 0 ? "bg-red-400 h-full rounded-full" : "bg-blue-400 h-full rounded-full"}
        style={{ width: `${pct}px` }}
      />
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

  const [corrSeason, setCorrSeason] = useState<CorrSeason>("Annual");

  useEffect(() => {
    if (selectedDistrictCode) {
      fetchDistrictProfile(selectedDistrictCode);
    }
  }, [selectedDistrictCode]);

  if (!selectedDistrictCode) return null;

  const indexProfile = districtProfile?.indices[selectedIndex];
  const district = districtProfile?.district;

  const hasCorrData = CORR_SEASONS.some(
    (s) => !!(indexProfile?.correlations?.[corrKey("SOI", s)])
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1 h-9 rounded-full bg-blue-500 shrink-0" />
          <div className="min-w-0">
            {district ? (
              <>
                <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
                  {district.name}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">{district.state_name}</p>
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
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 ml-2"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Loading */}
      {profileLoading && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          <span className="animate-pulse">Loading profile…</span>
        </div>
      )}

      {/* No data */}
      {!profileLoading && !indexProfile && districtProfile && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm px-6 text-center">
          No data available for <span className="font-mono text-slate-500 mx-1">{selectedIndex}</span> in this district.
        </div>
      )}

      {/* Content */}
      {!profileLoading && indexProfile && (
        <div className="flex-1 overflow-y-auto py-3 space-y-3 px-3">

          {/* ── Time series card ─────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Time Series vs SOI
                </span>
              </div>
              {indexProfile.trend?.slope !== null && indexProfile.trend && (
                <span
                  className={[
                    "text-[11px] font-mono font-semibold",
                    (indexProfile.trend.p_value ?? 1) < 0.05
                      ? (indexProfile.trend.slope ?? 0) > 0
                        ? "text-red-600"
                        : "text-blue-600"
                      : "text-slate-400",
                  ].join(" ")}
                >
                  {(indexProfile.trend.slope ?? 0) > 0 ? "+" : ""}
                  {indexProfile.trend.slope!.toFixed(3)}{" "}
                  <span className="text-slate-400 font-normal">{indexProfile.trend.units}</span>
                </span>
              )}
            </div>
            <div className="px-3 pt-2 pb-3" style={{ height: 270 }}>
              <SOIComparisonChart
                data={indexProfile.time_series}
                trend={indexProfile.trend}
                units={indexProfile.units}
                indexName={selectedIndex}
              />
            </div>
          </div>

          {/* ── Mann-Kendall trends card ──────────────────────── */}
          {districtProfile && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Trends (per decade)
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">* p &lt; 0.05</span>
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
                      className={[
                        "flex items-center justify-between px-3 py-2 rounded-lg transition-colors",
                        isCurrent ? "bg-blue-50" : "hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "font-mono text-xs w-14 shrink-0",
                          isCurrent ? "text-blue-700 font-semibold" : "text-slate-500",
                        ].join(" ")}
                      >
                        {name}
                      </span>
                      <div className="flex items-center gap-2">
                        <TrendMiniBar slope={slope} />
                        {slope !== null ? (
                          <span
                            className={[
                              "font-mono text-xs tabular-nums w-16 text-right",
                              slope > 0 ? "text-red-600" : "text-blue-600",
                              sig ? "font-semibold" : "",
                            ].join(" ")}
                          >
                            {slope > 0 ? "+" : ""}
                            {slope.toFixed(3)}
                            {sig && <span className="text-amber-500 ml-0.5">*</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-200 w-16 text-right">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SOI Correlation card ──────────────────────────── */}
          {hasCorrData && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="px-3.5 pt-2.5 pb-2 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      SOI Correlation
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">* |r| &gt; 0.3</span>
                </div>
                {/* Season selector */}
                <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
                  {CORR_SEASONS.map((s) => {
                    const hasData = !!(indexProfile.correlations?.[corrKey("SOI", s)]);
                    const active = corrSeason === s;
                    return (
                      <button
                        key={s}
                        onClick={() => hasData && setCorrSeason(s)}
                        className={[
                          "flex-1 py-1 rounded-md text-[10px] font-medium transition-all",
                          active
                            ? "bg-white text-slate-800 shadow-sm border border-slate-200"
                            : hasData
                            ? "text-slate-500 hover:text-slate-700"
                            : "text-slate-300 cursor-not-allowed",
                        ].join(" ")}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Correlation display */}
              <div className="px-4 py-4">
                {(() => {
                  const info = indexProfile.correlations?.[corrKey("SOI", corrSeason)];
                  if (!info) {
                    return (
                      <p className="text-xs text-slate-400 text-center py-3">
                        No data for {corrSeason === "Annual" ? "annual" : corrSeason} season.
                      </p>
                    );
                  }
                  const r = info.r;
                  const sig = r !== null && Math.abs(r) > 0.3;
                  return (
                    <div className="space-y-3">
                      {/* Big r value */}
                      <div className="flex items-end gap-3">
                        <span
                          className={[
                            "text-3xl font-mono font-bold tabular-nums leading-none",
                            r === null
                              ? "text-slate-200"
                              : sig
                              ? r > 0
                                ? "text-red-600"
                                : "text-blue-600"
                              : "text-slate-400",
                          ].join(" ")}
                        >
                          {r !== null ? (r >= 0 ? "+" : "") + r.toFixed(3) : "—"}
                        </span>
                        <div className="pb-1 flex flex-col gap-0.5">
                          {sig && (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-none">
                              Significant
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">Pearson r</span>
                        </div>
                      </div>

                      {/* Diverging bar */}
                      <div>
                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden relative">
                          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-300 z-10" />
                          {r !== null && (
                            <div
                              className={[
                                "absolute top-1 bottom-1 rounded-full",
                                r >= 0 ? "bg-red-400" : "bg-blue-400",
                              ].join(" ")}
                              style={{
                                left: r >= 0 ? "50%" : `${50 - Math.abs(r) * 50}%`,
                                width: `${Math.abs(r) * 50}%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                          <span>← La Niña (neg)</span>
                          <span>(pos) El Niño →</span>
                        </div>
                      </div>

                      {/* Metadata */}
                      {info.n_years != null && (
                        <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                          n = {info.n_years} years
                          {info.period
                            ? ` · ${info.period[0]}–${info.period[1]}`
                            : ""}
                          {corrSeason !== "Annual"
                            ? ` · ${corrSeason} season`
                            : " · Annual"}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* bottom breathing room */}
          <div className="h-2" />
        </div>
      )}
    </div>
  );
}
