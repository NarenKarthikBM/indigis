import {
  Scatter, // used for backend RP reference points
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  Area,
  ComposedChart,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { GEVParams, ReturnPeriods } from "../../types/climate.types";

interface ReturnPeriodChartProps {
  returnPeriods: ReturnPeriods | null;
  gevParams: GEVParams | null;
  units: string;
  indexName: string;
}

/**
 * GEV return level: quantile z_T such that P(X ≤ z_T) = 1 − 1/T.
 *
 * Uses scipy's genextreme parameterisation (shape ξ):
 *   ξ ≠ 0:  z_T = loc + (scale/ξ) · (y_T^(−ξ) − 1)   where y_T = −ln(1 − 1/T)
 *   ξ = 0:  z_T = loc − scale · ln(y_T)               (Gumbel limit)
 */
function gevReturnLevel(rp: number, { loc, scale, shape }: GEVParams): number {
  const yT = -Math.log(1 - 1 / rp);
  if (Math.abs(shape) < 1e-6) return loc - scale * Math.log(yT);
  return loc + (scale / shape) * (Math.pow(yT, -shape) - 1);
}

export default function ReturnPeriodChart({
  returnPeriods,
  gevParams,
  units,
  indexName,
}: ReturnPeriodChartProps) {
  // Backend per-pixel GEV reference points (spatial mean of per-pixel return levels)
  const backendRPs = returnPeriods
    ? (
        [
          { rp: 10, value: returnPeriods.rp_10 },
          { rp: 25, value: returnPeriods.rp_25 },
          { rp: 50, value: returnPeriods.rp_50 },
          { rp: 100, value: returnPeriods.rp_100 },
        ] as { rp: number; value: number | null }[]
      )
        .filter((p) => p.value !== null)
        .map((p) => ({ rp: p.rp, value: p.value as number }))
    : [];

  if (!gevParams && !backendRPs.length) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No return period data available
      </div>
    );
  }

  // Smooth GEV curve from server-fitted parameters (scipy MLE)
  const rpMin = 1.1;
  const rpMax =
    Math.max(...backendRPs.map((p) => p.rp), 100) * 1.3;

  const NUM_PTS = 150;
  const logMin = Math.log(rpMin);
  const logMax = Math.log(rpMax);
  const gevCurve = gevParams
    ? Array.from({ length: NUM_PTS }, (_, i) => {
        const rp = Math.exp(logMin + (i / (NUM_PTS - 1)) * (logMax - logMin));
        return { rp, value: gevReturnLevel(rp, gevParams) };
      })
    : [];

  const xTicks = [2, 5, 10, 25, 50, 100, 200].filter(
    (t) => t >= rpMin && t <= rpMax * 1.05
  );

  const tailLabel = gevParams
    ? gevParams.shape < -0.05
      ? "Weibull (bounded)"
      : gevParams.shape > 0.05
      ? "Fréchet (heavy tail)"
      : "Gumbel"
    : null;

  const tailBadgeClass = gevParams
    ? gevParams.shape < -0.05
      ? "text-sky-400 bg-sky-950/60 border-sky-800/60"
      : gevParams.shape > 0.05
      ? "text-amber-400 bg-amber-950/60 border-amber-800/60"
      : "text-slate-400 bg-slate-800 border-slate-700"
    : "";

  const tooltipStyle = {
    backgroundColor: "#0d1525",
    border: "1px solid #1e3a5f",
    borderRadius: 8,
    color: "#cbd5e1",
    fontSize: 11,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    padding: "8px 12px",
  };

  return (
    <div className="w-full h-full flex flex-col gap-2.5">
      {/* Legend row */}
      <div className="flex items-center gap-4 shrink-0 px-1">
        {gevCurve.length > 0 && (
          <span className="flex items-center gap-2 text-[11px] text-slate-400">
            <svg width="20" height="10" viewBox="0 0 20 10">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            GEV fit (MLE)
          </span>
        )}
        {backendRPs.length > 0 && (
          <span className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400" />
            Backend RPs
          </span>
        )}
      </div>

      {/* GEV params row */}
      {gevParams && (
        <div className="flex items-center gap-1.5 flex-wrap shrink-0 px-1">
          {[
            { label: "ξ", value: gevParams.shape.toFixed(3) },
            { label: "σ", value: gevParams.scale.toFixed(2) },
            { label: "μ", value: gevParams.loc.toFixed(2) },
          ].map(({ label, value }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-900/80 border border-slate-700/80 rounded-md px-2 py-0.5 text-slate-400"
            >
              <span className="text-slate-500">{label} =</span>
              <span className="text-slate-300 tabular-nums">{value}</span>
            </span>
          ))}
          {tailLabel && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${tailBadgeClass}`}>
              {tailLabel}
            </span>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 6, right: 16, left: 28, bottom: 24 }}>
          <defs>
            <linearGradient id="gevGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="rp"
            type="number"
            scale="log"
            domain={[rpMin, rpMax]}
            ticks={xTicks}
            tick={{ fontSize: 10, fill: "#475569" }}
            axisLine={{ stroke: "#1e293b" }}
            tickLine={false}
            label={{
              value: "Return Period (years)",
              position: "insideBottom",
              fontSize: 10,
              dy: 16,
              fill: "#475569",
            }}
            tickFormatter={(v) => `${v}`}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#475569" }}
            axisLine={false}
            tickLine={false}
            width={36}
            label={{
              value: units,
              angle: -90,
              position: "insideLeft",
              fontSize: 10,
              dx: -8,
              fill: "#475569",
            }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}
            formatter={(v: number, name: string) => [
              `${v.toFixed(2)} ${units}`,
              name === "Backend RPs" ? `${indexName} — backend RP` : `${indexName} — GEV fit`,
            ]}
            labelFormatter={(l) => `Return period: ${Number(l).toFixed(1)} yr`}
          />
          {[10, 25, 50, 100].map((rp) => (
            <ReferenceLine
              key={rp}
              x={rp}
              stroke="#334155"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{
                value: `${rp}yr`,
                position: "insideTopRight",
                fontSize: 9,
                fill: "#475569",
                dy: -2,
              }}
            />
          ))}
          {/* Area fill under GEV curve */}
          {gevCurve.length > 0 && (
            <Area
              data={gevCurve}
              type="monotone"
              dataKey="value"
              stroke="none"
              fill="url(#gevGradient)"
              legendType="none"
              isAnimationActive={false}
            />
          )}
          {/* Smooth GEV curve from server-fitted parameters */}
          {gevCurve.length > 0 && (
            <Line
              data={gevCurve}
              type="monotone"
              dataKey="value"
              stroke="#34d399"
              dot={false}
              strokeWidth={2.5}
              name="GEV curve"
              legendType="none"
              isAnimationActive={false}
            />
          )}
          {/* Backend per-pixel GEV reference points (cross-validation) */}
          {backendRPs.length > 0 && (
            <Scatter
              name="Backend RPs"
              data={backendRPs}
              dataKey="value"
              fill="#f87171"
              r={5}
              legendType="none"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
