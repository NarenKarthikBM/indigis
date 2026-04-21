import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ETCCDIIndexName, IndexProfile } from "../../types/climate.types";

interface RadarChartProps {
  indices: Partial<Record<ETCCDIIndexName, IndexProfile>>;
  metric: "latest_value" | "trend_slope";
}

const INDEX_ORDER: ETCCDIIndexName[] = [
  "TXx", "TNx", "TX90p", "WSDI",
  "CSDI", "TN10p", "TXn", "TNn",
];

export default function RadarChart({ indices, metric }: RadarChartProps) {
  // Build chart data: normalize each value to 0-1 across all districts (we only have
  // this district, so we show absolute value scaled by estimated range)
  const available = INDEX_ORDER.filter((name) => name in indices);

  if (available.length < 3) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Insufficient data for radar chart
      </div>
    );
  }

  const rawValues = available.map((name) => {
    const profile = indices[name]!;
    if (metric === "trend_slope") {
      return { name, value: profile.trend?.slope ?? null };
    }
    return { name, value: profile.latest_value };
  });

  // Normalize 0-1 within the available values
  const validValues = rawValues
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
  const minV = Math.min(...validValues);
  const maxV = Math.max(...validValues);
  const range = maxV - minV || 1;

  const data = rawValues.map((d) => ({
    subject: d.name,
    value: d.value !== null ? ((d.value - minV) / range) * 100 : 0,
    rawValue: d.value,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsRadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip
          formatter={(_, __, props) => [
            props.payload.rawValue !== null
              ? Number(props.payload.rawValue).toFixed(2)
              : "-",
            props.payload.subject,
          ]}
        />
        <Radar
          dataKey="value"
          stroke="#2563eb"
          fill="#2563eb"
          fillOpacity={0.25}
          strokeWidth={1.5}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
