import { useState, useEffect } from "react";
import { useStore } from "../../store";
import type { ClimateMetric } from "../../types/climate.types";

const YEAR_RANGE = Array.from({ length: 36 }, (_, i) => 2025 - i);

type CorrSeason = "DJF" | "MAM" | "JJA" | "SON";
const SEASONS: CorrSeason[] = ["DJF", "MAM", "JJA", "SON"];

function initMode(metric: ClimateMetric): "trend" | "year" | "corr" {
  if (metric === "trend_slope") return "trend";
  if (metric === "latest_value") return "year";
  if (metric.startsWith("corr_")) return "corr";
  return "trend";
}

function initTC(metric: ClimateMetric): "SOI" | "IOD" {
  return metric.startsWith("corr_iod") ? "IOD" : "SOI";
}

function initSeason(metric: ClimateMetric): CorrSeason {
  const parts = metric.split("_");
  const last = parts[parts.length - 1]?.toUpperCase();
  if (last === "DJF" || last === "MAM" || last === "JJA" || last === "SON") return last;
  return "DJF";
}

function resolveMetric(
  mode: "trend" | "year" | "corr",
  tc: "SOI" | "IOD",
  season: CorrSeason
): ClimateMetric {
  if (mode === "trend") return "trend_slope";
  if (mode === "year") return "latest_value";
  const prefix = tc === "SOI" ? "corr_soi" : "corr_iod";
  return `${prefix}_${season.toLowerCase()}` as ClimateMetric;
}

export default function MetricToggle() {
  const selectedMetric = useStore((s) => s.selectedMetric);
  const setSelectedMetric = useStore((s) => s.setSelectedMetric);
  const selectedYear = useStore((s) => s.selectedYear);
  const setSelectedYear = useStore((s) => s.setSelectedYear);

  const [primaryMode, setPrimaryMode] = useState<"trend" | "year" | "corr">(() => initMode(selectedMetric));
  const [corrTC, setCorrTC] = useState<"SOI" | "IOD">(() => initTC(selectedMetric));
  const [corrSeason, setCorrSeason] = useState<CorrSeason>(() => initSeason(selectedMetric));

  useEffect(() => {
    setSelectedMetric(resolveMetric(primaryMode, corrTC, corrSeason));
  }, [primaryMode, corrTC, corrSeason]);

  const modeLabels: Record<"trend" | "year" | "corr", string> = {
    trend: "Trend",
    year: "Year",
    corr: "Correlations",
  };

  const tcActiveClass = {
    SOI: "bg-slate-700 text-violet-300 shadow-sm border border-violet-800",
    IOD: "bg-slate-700 text-teal-300 shadow-sm border border-teal-800",
  };
  const seasonBtnClass = {
    SOI: "bg-violet-700 text-white border-violet-700 shadow-sm",
    IOD: "bg-teal-700 text-white border-teal-700 shadow-sm",
  };

  return (
    <div className="space-y-3">
      {/* Primary 3-segment selector */}
      <div className="flex gap-0.5 p-0.5 bg-slate-800 rounded-lg">
        {(["trend", "year", "corr"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setPrimaryMode(mode)}
            className={[
              "flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all",
              primaryMode === mode
                ? "bg-slate-700 text-white shadow-sm border border-slate-600"
                : "text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {modeLabels[mode]}
          </button>
        ))}
      </div>

      {/* Trend: description */}
      {primaryMode === "trend" && (
        <p className="text-[10px] text-slate-600 leading-snug px-0.5">
          Sen's slope per decade - Mann-Kendall significance tested.
        </p>
      )}

      {/* Year picker */}
      {primaryMode === "year" && (
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="w-full text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {YEAR_RANGE.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}

      {/* Correlation controls */}
      {primaryMode === "corr" && (
        <div className="space-y-2">
          {/* TC toggle */}
          <div className="flex gap-0.5 p-0.5 bg-slate-800 rounded-lg">
            {(["SOI", "IOD"] as const).map((tc) => (
              <button
                key={tc}
                onClick={() => setCorrTC(tc)}
                className={[
                  "flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all",
                  corrTC === tc ? tcActiveClass[tc] : "text-slate-400 hover:text-slate-200",
                ].join(" ")}
              >
                {tc}
              </button>
            ))}
          </div>

          {/* Season grid */}
          <div className="grid grid-cols-3 gap-1">
            {SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => setCorrSeason(s)}
                className={[
                  "px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all",
                  corrSeason === s
                    ? seasonBtnClass[corrTC]
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>

          {/* TC description */}
          <p className="text-[10px] text-slate-600 leading-snug px-0.5">
            <span className="text-slate-500 font-medium">
              {corrTC === "SOI" ? "ENSO - Southern Oscillation Index" : "IOD - Dipole Mode Index"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
