import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  ComposedChart,
  ResponsiveContainer,
} from "recharts";
import type { ReturnPeriods, TimeSeriesPoint } from "../../types/climate.types";

interface ReturnPeriodChartProps {
  returnPeriods: ReturnPeriods;
  timeSeries: TimeSeriesPoint[];
  units: string;
  indexName: string;
}

export default function ReturnPeriodChart({
  returnPeriods,
  timeSeries,
  units,
  indexName,
}: ReturnPeriodChartProps) {
  // GEV return level points
  const gevPoints = (
    [
      { rp: 10, value: returnPeriods.rp_10 },
      { rp: 25, value: returnPeriods.rp_25 },
      { rp: 50, value: returnPeriods.rp_50 },
      { rp: 100, value: returnPeriods.rp_100 },
    ] as { rp: number; value: number | null }[]
  )
    .filter((p) => p.value !== null)
    .map((p) => ({ rp: p.rp, value: p.value as number }));

  // Empirical return periods from observed time series (Weibull plotting position)
  const validValues = timeSeries
    .map((d) => d.value)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const n = validValues.length;
  const empiricalPoints = validValues.map((v, i) => ({
    rp: n / (n - i),       // Weibull: T = N / rank (rank from largest → smallest)
    value: v,
  }));

  const allPoints = [...gevPoints, ...empiricalPoints];
  const maxRp = Math.max(...allPoints.map((p) => p.rp), 10);

  if (!gevPoints.length) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        No return period data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="rp"
          type="number"
          scale="log"
          domain={[1, maxRp * 1.2]}
          tick={{ fontSize: 10 }}
          label={{ value: "Return Period (years)", position: "insideBottom", fontSize: 10, dy: 12 }}
          tickFormatter={(v) => `${v}`}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          label={{ value: units, angle: -90, position: "insideLeft", fontSize: 10, dy: 30 }}
        />
        <Tooltip
          formatter={(v: number) => [v.toFixed(2), indexName]}
          labelFormatter={(l) => `RP: ${Number(l).toFixed(1)} yr`}
        />
        <Scatter
          name="Empirical"
          data={empiricalPoints}
          fill="#93c5fd"
          opacity={0.7}
          r={3}
        />
        <Line
          data={gevPoints}
          type="monotone"
          dataKey="value"
          stroke="#dc2626"
          dot={{ r: 4, fill: "#dc2626" }}
          strokeWidth={2}
          name="GEV fit"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
