import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { TimeSeriesPoint, TrendInfo } from "../../types/climate.types";

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  trend: TrendInfo | null;
  units: string;
  indexName: string;
}

export default function TimeSeriesChart({
  data,
  trend,
  units,
  indexName,
}: TimeSeriesChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        No time series data available
      </div>
    );
  }

  const validData = data.filter((d) => d.value !== null);
  const values = validData.map((d) => d.value!);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const buffer = (dataMax - dataMin) * 0.1; // 10% buffer

  const yAxisDomain: [number, number] = [
    dataMin - buffer > 0 ? dataMin - buffer : 0,
    dataMax + buffer,
  ];

  const mean =
    validData.reduce((s, d) => s + (d.value ?? 0), 0) / validData.length;

  // Add trend line points using Sen's slope
  const chartData = data.map((d) => {
    const point: Record<string, number | null> = { year: d.year, value: d.value };
    if (trend?.slope !== null && trend?.period?.length === 2) {
      const midYear = (trend.period[0] + trend.period[1]) / 2;
      const slopePerYear = (trend.slope ?? 0) / 10;
      point.trendLine = mean + slopePerYear * (d.year - midYear);
    }
    return point;
  });

  const trendDir =
    trend?.slope !== null && trend !== null
      ? trend.slope! > 0
        ? "↑"
        : trend.slope! < 0
        ? "↓"
        : "→"
      : "";

  const isSignificant = trend?.p_value !== null && (trend?.p_value ?? 1) < 0.05;

  return (
    <div>
      {trend && (
        <p className="text-xs text-gray-500 mb-1">
          {/* Trend: {trendDir}{" "} */}
          <span className={isSignificant ? "text-orange-600 font-semibold" : "text-gray-500"}>
            {trend.slope !== null ? `${trend.slope.toFixed(3)} ${trend.units}` : "-"}
          </span>
          {trend.p_value !== null && (
            <span className="ml-2">
              (p={trend.p_value.toFixed(3)}
              {isSignificant ? ", significant" : ""})
            </span>
          )}
        </p>
      )}
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => String(v)}
          />
          <YAxis
            domain={[yAxisDomain[0], yAxisDomain[1]]}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.toFixed(1)}
            label={{ value: units, angle: -90, position: "insideLeft", fontSize: 10, dy: 30 }}
          />
          <Tooltip
            formatter={(v: number) => [v.toFixed(2), indexName]}
            labelFormatter={(l) => `Year: ${l}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
            dot={{ r: 2 }}
            strokeWidth={1.5}
            connectNulls
          />
          {trend?.slope !== null && (
            <Line
              type="monotone"
              dataKey="trendLine"
              stroke="#dc2626"
              dot={false}
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
