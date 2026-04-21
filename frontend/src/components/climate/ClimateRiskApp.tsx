import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../../store";
import type { ETCCDIIndexName } from "../../types/climate.types";

const INDEX_META: Record<
  ETCCDIIndexName,
  { desc: string; shortDesc: string; category: "warm" | "cold" }
> = {
  TXx:   { shortDesc: "Max Tmax",       desc: "Hottest day of the year",         category: "warm" },
  TNn:   { shortDesc: "Min Tmin",        desc: "Coldest night of the year",        category: "cold" },
  TNx:   { shortDesc: "Max Tmin",        desc: "Warmest nights intensity",         category: "warm" },
  TXn:   { shortDesc: "Min Tmax",        desc: "Coolest day indicator",            category: "cold" },
  TX90p: { shortDesc: "Warm Days %",     desc: "Days above 90th percentile",       category: "warm" },
  TN10p: { shortDesc: "Cool Nights %",   desc: "Nights below 10th percentile",     category: "cold" },
  WSDI:  { shortDesc: "Warm Spells",     desc: "Consecutive warm day spells",      category: "warm" },
  CSDI:  { shortDesc: "Cold Spells",     desc: "Consecutive cold night spells",    category: "cold" },
};

export default function ClimateRiskApp() {
  const fetchAvailableIndices = useStore((s) => s.fetchAvailableIndices);
  const availableIndices = useStore((s) => s.availableIndices);
  const fetchRankings = useStore((s) => s.fetchRankings);
  const rankings = useStore((s) => s.rankings);
  const setSelectedIndex = useStore((s) => s.setSelectedIndex);
  const setSelectedMetric = useStore((s) => s.setSelectedMetric);

  useEffect(() => {
    fetchAvailableIndices();
    fetchRankings();
  }, []);

  const maxYears = availableIndices.reduce(
    (max, idx) => Math.max(max, idx.available_years.length),
    0
  );
  const indicesWithData = availableIndices.filter(
    (i) => i.available_years.length > 0
  ).length;

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-slate-100 px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Logo mark */}
            <div className="w-7 h-7 rounded-lg bg-blue-700 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.5" />
                <path d="M7 2 L7 7 L10.5 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-slate-900 tracking-tight text-sm">IndiGIS</span>
            <span className="text-slate-200 select-none">·</span>
            <span className="text-sm text-slate-400">Climate Risk Engine</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              to="/explore"
              className="px-4 py-1.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
            >
              Explorer →
            </Link>
            <Link
              to="/tools"
              className="px-4 py-1.5 text-slate-500 text-sm rounded-lg hover:bg-slate-50 transition-colors"
            >
              Tools
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-8">
        {/* Hero */}
        <section className="py-14 space-y-4">
          <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase">
            ERA5 · ETCCDI · India
          </p>
          <h1 className="text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight">
            District-scale<br />
            Heat-Teleconnection analysis
          </h1>
          <p className="text-slate-500 text-lg max-w-xl leading-relaxed">
            Extreme temperature indices derived from ERA5 reanalysis for every
            district and state in India. Mann-Kendall trends and SOI teleconnection
            analysis for 1990-2024.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white rounded-lg font-medium text-sm hover:bg-blue-800 transition-colors shadow-sm"
            >
              Open Climate Explorer
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M7.5 2.5 12 7l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </section>

        {/* Stats row */}
        <section className="border-y border-slate-100 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "8",       label: "ETCCDI Indices",   sub: `${indicesWithData} with data` },
            { value: String(maxYears || "35"), label: "Years of Data",    sub: "1990-2025 target" },
            // { value: "",     label: "Districts",         sub: "State-level too" },
            { value: "0.25°",   label: "ERA5 Resolution",   sub: "ECMWF reanalysis" },
          ].map(({ value, label, sub }) => (
            <div key={label}>
              <p className="text-4xl font-bold text-slate-900 tabular-nums tracking-tight">
                {value}
              </p>
              <p className="text-sm text-slate-700 mt-1">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </section>

        {/* Available Indices */}
        <section className="py-10">
          <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-5">
            Available Indices
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {availableIndices.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border border-slate-100 bg-slate-50 animate-pulse"
                  />
                ))
              : availableIndices.map((idx) => {
                  const meta = INDEX_META[idx.name];
                  const hasData = idx.available_years.length > 0;
                  return (
                    <button
                      key={idx.name}
                      onClick={() => {
                        setSelectedIndex(idx.name);
                        setSelectedMetric("trend_slope");
                      }}
                      className={[
                        "group text-left p-4 rounded-xl border transition-all",
                        hasData
                          ? "border-slate-200 hover:border-blue-300 hover:shadow-sm hover:bg-blue-50/40 cursor-pointer"
                          : "border-slate-100 cursor-default opacity-60",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-mono font-bold text-slate-800">
                          {idx.name}
                        </span>
                        <span
                          className={[
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            meta?.category === "warm"
                              ? "bg-red-50 text-red-500"
                              : "bg-sky-50 text-sky-600",
                          ].join(" ")}
                        >
                          {meta?.category === "warm" ? "warm" : "cold"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-snug">
                        {idx.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                        {meta?.desc}
                      </p>
                      <p className="text-xs mt-2.5">
                        {hasData ? (
                          <span className="text-slate-400">
                            {idx.available_years.length} yr available
                          </span>
                        ) : (
                          <span className="text-amber-500">No data yet</span>
                        )}
                      </p>
                    </button>
                  );
                })}
          </div>
        </section>

        {/* Top warming districts */}
        {rankings.length > 0 && (
          <section className="py-2 pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
                Top Warming Districts
              </h2>
              <Link
                to="/explore"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-10">
                      #
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      District
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      State
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      TXx Trend (°C/decade)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.slice(0, 10).map((row, i) => (
                    <tr
                      key={row.district_code}
                      className={[
                        "border-t border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer",
                        i % 2 === 0 ? "" : "bg-slate-50/30",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3 text-slate-400 text-xs tabular-nums">
                        {row.rank}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {row.district_name}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{row.state_name}</td>
                      <td className="px-5 py-3 text-right font-mono text-red-600 font-semibold">
                        {row.value !== null ? `+${row.value.toFixed(3)}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Data pipeline */}
        <section className="border-t border-slate-100 py-8 pb-14">
          <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-4">
            Data Pipeline
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "ERA5 CDS",
              "CDO ECA Operators",
              "Annual COGs",
              "Zonal Stats (~700 districts)",
              "Mann-Kendall Trends",
              "SOI Correlations",
            ].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-2">
                <span className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-slate-600 font-medium whitespace-nowrap">
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="text-slate-300 shrink-0"
                  >
                    <path
                      d="M2 7h10M7.5 3 12 7l-4.5 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
