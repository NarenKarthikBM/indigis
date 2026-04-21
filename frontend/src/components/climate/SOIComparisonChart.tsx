import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TimeSeriesPoint, TrendInfo } from "../../types/climate.types";

const SOI_ANNUAL: Record<number, number> = {
  1951: -0.27, 1952: -0.01, 1953: -0.41, 1954: 0.45, 1955: 1.03,
  1956: 1.09, 1957: -0.18, 1958: -0.15, 1959: 0.14, 1960: 0.50,
  1961: 0.18, 1962: 0.53, 1963: -0.04, 1964: 0.62, 1965: -0.51,
  1966: -0.22, 1967: 0.48, 1968: 0.39, 1969: -0.35, 1970: 0.48,
  1971: 1.11, 1972: -0.48, 1973: 0.74, 1974: 1.10, 1975: 1.33,
  1976: 0.32, 1977: -0.63, 1978: -0.07, 1979: 0.14, 1980: -0.07,
  1981: 0.24, 1982: -0.88, 1983: -0.76, 1984: 0.14, 1985: 0.28,
  1986: -0.08, 1987: -0.93, 1988: 0.82, 1989: 0.71, 1990: -0.12,
  1991: -0.58, 1992: -0.83, 1993: -0.65, 1994: -0.83, 1995: -0.02,
  1996: 0.67, 1997: -0.73, 1998: -0.03, 1999: 0.85, 2000: 0.85,
  2001: 0.26, 2002: -0.33, 2003: -0.09, 2004: -0.26, 2005: -0.18,
  2006: 0.03, 2007: 0.27, 2008: 1.12, 2009: 0.17, 2010: 0.91,
  2011: 1.40, 2012: 0.13, 2013: 0.45, 2014: -0.13, 2015: -0.79,
  2016: -0.19, 2017: 0.36, 2018: 0.27, 2019: -0.50, 2020: 0.47,
  2021: 0.92, 2022: 1.31, 2023: -0.12, 2024: 0.18, 2025: 0.57,
};

// Nino 3.4 SST seasonal data (DJF/MAM/JJA/SON) used as seasonal SOI proxy
const SOI_SEASONAL: Record<string, Record<number, number>> = {
  "DJF": {
            1990: 26.660, 1991: 27.017, 1992: 28.400, 1993: 26.763, 1994: 26.737, 1995: 27.637, 1996: 25.743, 1997: 26.113,
            1998: 28.867, 1999: 25.067, 2000: 24.950, 2001: 25.870, 2002: 26.430, 2003: 27.503, 2004: 26.940, 2005: 27.220,
            2006: 25.797, 2007: 27.287, 2008: 24.983, 2009: 25.787, 2010: 28.140, 2011: 25.213, 2012: 25.763, 2013: 26.197,
            2014: 26.207, 2015: 27.177, 2016: 29.127, 2017: 26.297, 2018: 25.720, 2019: 27.380, 2020: 27.130, 2021: 25.580,
            2022: 25.667, 2023: 25.957, 2024: 28.413, 2025: 26.040,
        },
        "MAM": {
            1990: 27.750, 1991: 27.843, 1992: 28.887, 1993: 28.263, 1994: 27.903, 1995: 27.890, 1996: 27.190, 1997: 27.867,
            1998: 28.577, 1999: 26.607, 2000: 26.773, 2001: 27.243, 2002: 27.790, 2003: 27.550, 2004: 27.763, 2005: 28.017,
            2006: 27.307, 2007: 27.353, 2008: 26.663, 2009: 27.350, 2010: 28.030, 2011: 26.940, 2012: 27.200, 2013: 27.377,
            2014: 27.717, 2015: 28.373, 2016: 28.617, 2017: 27.883, 2018: 27.173, 2019: 28.337, 2020: 27.867, 2021: 27.017,
            2022: 26.610, 2023: 27.840, 2024: 28.387, 2025: 27.590,
        },
        "JJA": {
            1990: 27.363, 1991: 27.943, 1992: 27.573, 1993: 27.530, 1994: 27.653, 1995: 26.967, 1996: 26.927, 1997: 28.810,
            1998: 26.403, 1999: 26.097, 2000: 26.647, 2001: 27.197, 2002: 28.063, 2003: 27.350, 2004: 27.753, 2005: 27.210,
            2006: 27.397, 2007: 26.740, 2008: 26.917, 2009: 27.747, 2010: 26.243, 2011: 26.810, 2012: 27.537, 2013: 26.893,
            2014: 27.337, 2015: 28.813, 2016: 26.930, 2017: 27.433, 2018: 27.377, 2019: 27.573, 2020: 26.880, 2021: 26.890,
            2022: 26.487, 2023: 28.363, 2024: 27.323, 2025: 27.100,
        },
        "SON": {
            1990: 26.893, 1991: 27.540, 1992: 26.497, 1993: 26.850, 1994: 27.493, 1995: 25.773, 1996: 26.277, 1997: 29.017,
            1998: 25.317, 1999: 25.410, 2000: 26.047, 2001: 26.473, 2002: 27.980, 2003: 27.057, 2004: 27.443, 2005: 26.480,
            2006: 27.473, 2007: 25.367, 2008: 26.363, 2009: 27.720, 2010: 25.070, 2011: 25.703, 2012: 26.980, 2013: 26.540,
            2014: 27.210, 2015: 29.143, 2016: 26.020, 2017: 26.060, 2018: 27.473, 2019: 27.057, 2020: 25.543, 2021: 25.900,
            2022: 25.727, 2023: 28.493, 2024: 26.447, 2025: 26.160,
        },
};

type Season = "Annual" | "DJF" | "MAM" | "JJA" | "SON";
const SEASONS: Season[] = ["Annual", "DJF", "MAM", "JJA", "SON"];

interface Props {
  data: TimeSeriesPoint[];
  trend: TrendInfo | null;
  units: string;
  indexName: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: {p.value !== null && p.value !== undefined ? Number(p.value).toFixed(3) : "-"}
        </p>
      ))}
    </div>
  );
};

export default function SOIComparisonChart({ data, trend, units, indexName }: Props) {
  const [season, setSeason] = useState<Season>("Annual");

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No time series data
      </div>
    );
  }

  const validData = data.filter((d) => d.value !== null);
  const mean = validData.reduce((s, d) => s + (d.value ?? 0), 0) / validData.length;

  const soiData = season === "Annual" ? SOI_ANNUAL : SOI_SEASONAL[season];
  const soiLabel = season === "Annual" ? "SOI (Annual)" : `Nino 3.4 (${season})`;

  const chartData = data
    .filter((d) => d.value !== null)
    .map((d) => {
      const point: Record<string, number | null> = {
        year: d.year,
        index: d.value,
        soi: soiData[d.year] ?? null,
        trendLine: null,
      };
      if (trend?.slope !== null && trend?.period?.length === 2) {
        const midYear = (trend.period[0] + trend.period[1]) / 2;
        const slopePerYear = (trend.slope ?? 0) / 10;
        point.trendLine = mean + slopePerYear * (d.year - midYear);
      }
      return point;
    });

  // const isSignificant = trend?.p_value !== null && (trend?.p_value ?? 1) < 0.05;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1 shrink-0 gap-2">
        <p className="text-xs text-slate-500 truncate">
          {indexName} annual values vs {soiLabel}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {SEASONS.map((s) => (
            <button
              key={s}
              onClick={() => setSeason(s)}
              className={[
                "text-xs px-1.5 py-0.5 rounded border transition-colors",
                season === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "text-slate-500 border-slate-200 hover:border-blue-300",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
        {/* {trend && (
          <p className="text-xs shrink-0">
            <span className="text-slate-400">Trend: </span>
            <span className={isSignificant ? "text-orange-600 font-semibold" : "text-slate-500"}>
              {trend.slope !== null
                ? `${trend.slope > 0 ? "+" : ""}${trend.slope.toFixed(3)} ${trend.units}`
                : "-"}
            </span>
            {trend.p_value !== null && (
              <span className="text-slate-400 ml-1">(p={trend.p_value.toFixed(3)})</span>
            )}
          </p>
        )} */}
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => String(v)}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.toFixed(1)}
            label={{
              value: units,
              angle: -90,
              position: "insideLeft",
              fontSize: 9,
              dy: 30,
              fill: "#64748b",
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.toFixed(1)}
            label={{
              value: soiLabel,
              angle: 90,
              position: "insideRight",
              fontSize: 9,
              dy: -20,
              fill: "#94a3b8",
            }}
          />
          <ReferenceLine yAxisId="right" y={0} stroke="#cbd5e1" strokeWidth={1} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
            formatter={(value) =>
              value === "soi" ? soiLabel : value === "index" ? indexName : "Trend"
            }
          />
          <Bar
            yAxisId="right"
            dataKey="soi"
            fill="#94a3b8"
            opacity={0.45}
            name="soi"
            radius={[1, 1, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="index"
            stroke="#1d4ed8"
            dot={{ r: 2, fill: "#1d4ed8" }}
            strokeWidth={2}
            name="index"
            connectNulls
          />
          {trend?.slope !== null && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="trendLine"
              stroke="#dc2626"
              dot={false}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              name="trend"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
