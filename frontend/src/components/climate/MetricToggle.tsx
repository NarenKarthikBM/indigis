import { useStore } from "../../store";
import type { ClimateMetric } from "../../types/climate.types";

const YEAR_RANGE = Array.from({ length: 36 }, (_, i) => 2025 - i);

type TcSeason = { label: string; metric: ClimateMetric; title: string };

const SOI_SEASONS: TcSeason[] = [
  { label: "Annual", metric: "corr_soi",      title: "Annual SOI correlation (Pearson r)" },
  { label: "DJF",    metric: "corr_soi_djf",  title: "Dec–Jan–Feb SOI correlation" },
  { label: "MAM",    metric: "corr_soi_mam",  title: "Mar–Apr–May SOI correlation" },
  { label: "JJA",   metric: "corr_soi_jja", title: "Jun–Jul–Aug SOI correlation" },
  { label: "SON",   metric: "corr_soi_son", title: "Sep-Oct-Nov SOI correlation" },
];

const DMI_SEASONS: TcSeason[] = [
  { label: "Annual", metric: "corr_iod",      title: "Annual IOD/DMI correlation (Pearson r)" },
  { label: "DJF",    metric: "corr_iod_djf",  title: "Dec–Jan–Feb IOD correlation" },
  { label: "MAM",    metric: "corr_iod_mam",  title: "Mar–Apr–May IOD correlation" },
  { label: "JJA",   metric: "corr_iod_jja", title: "Jun–Jul–Aug IOD correlation" },
  { label: "SON",   metric: "corr_iod_son", title: "Sep-Oct-Nov IOD correlation" },
];

const SOI_METRIC_SET = new Set<ClimateMetric>(SOI_SEASONS.map((s) => s.metric));
const DMI_METRIC_SET = new Set<ClimateMetric>(DMI_SEASONS.map((s) => s.metric));


export default function MetricToggle() {
  const selectedMetric = useStore((s) => s.selectedMetric);
  const setSelectedMetric = useStore((s) => s.setSelectedMetric);
  const selectedYear = useStore((s) => s.selectedYear);
  const setSelectedYear = useStore((s) => s.setSelectedYear);

  const isSoiActive = SOI_METRIC_SET.has(selectedMetric);
  const isDmiActive = DMI_METRIC_SET.has(selectedMetric);

  return (
    <div className="space-y-1.5">
      {/* ── Trend ─────────────────────────────── */}
      <button
        title="Sen's slope per decade"
        onClick={() => setSelectedMetric("trend_slope")}
        className={[
          "w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all",
          selectedMetric === "trend_slope"
            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50",
        ].join(" ")}
      >
        <span className="flex-1">Trend</span>
        <span className={["text-[10px]", selectedMetric === "trend_slope" ? "text-blue-200" : "text-slate-400"].join(" ")}>
          per decade
        </span>
      </button>

      {/* ── Year value ────────────────────────── */}
      <button
        title="Annual index value for selected year"
        onClick={() => setSelectedMetric("latest_value")}
        className={[
          "w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all",
          selectedMetric === "latest_value"
            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50",
        ].join(" ")}
      >
        Year Value
      </button>
      <select
        value={selectedYear}
        onChange={(e) => {
          setSelectedYear(Number(e.target.value));
          if (selectedMetric !== "latest_value") setSelectedMetric("latest_value");
        }}
        className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:border-blue-400"
      >
        {YEAR_RANGE.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      {/* ── SOI Correlation ───────────────────── */}
      <div
        className={[
          "rounded-lg border transition-all overflow-hidden",
          isSoiActive ? "border-violet-300 bg-violet-50 shadow-sm" : "border-slate-200 bg-white",
        ].join(" ")}
      >
        <div className={["flex items-center gap-2 px-3 py-2 text-xs font-medium select-none", isSoiActive ? "text-violet-700" : "text-slate-600"].join(" ")}>
          <span className={["w-1.5 h-1.5 rounded-full shrink-0", isSoiActive ? "bg-violet-500" : "bg-slate-300"].join(" ")} />
          <span>SOI Correlation</span>
        </div>
        <div className="grid grid-cols-2 gap-1 px-2 pb-2">
          {SOI_SEASONS.map(({ label, metric, title }) => (
            <button
              key={metric}
              title={title}
              onClick={() => setSelectedMetric(metric)}
              className={[
                "px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all",
                selectedMetric === metric
                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                  : isSoiActive
                  ? "bg-white text-violet-700 border-violet-200 hover:border-violet-400 hover:bg-violet-50"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── DMI / IOD Correlation ─────────────── */}
      <div
        className={[
          "rounded-lg border transition-all overflow-hidden",
          isDmiActive ? "border-teal-300 bg-teal-50 shadow-sm" : "border-slate-200 bg-white",
        ].join(" ")}
      >
        <div className={["flex items-center gap-2 px-3 py-2 text-xs font-medium select-none", isDmiActive ? "text-teal-700" : "text-slate-600"].join(" ")}>
          <span className={["w-1.5 h-1.5 rounded-full shrink-0", isDmiActive ? "bg-teal-500" : "bg-slate-300"].join(" ")} />
          <span>IOD Correlation</span>
          <span className={["text-[9px] ml-auto", isDmiActive ? "text-teal-400" : "text-slate-400"].join(" ")}>DMI</span>
        </div>
        <div className="grid grid-cols-2 gap-1 px-2 pb-2">
          {DMI_SEASONS.map(({ label, metric, title }) => (
            <button
              key={metric}
              title={title}
              onClick={() => setSelectedMetric(metric)}
              className={[
                "px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all",
                selectedMetric === metric
                  ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                  : isDmiActive
                  ? "bg-white text-teal-700 border-teal-200 hover:border-teal-400 hover:bg-teal-50"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
