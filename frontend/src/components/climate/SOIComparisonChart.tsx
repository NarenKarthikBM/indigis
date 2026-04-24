import { useState } from "react";
import {
  ComposedChart,
  LineChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TimeSeriesPoint, TrendInfo } from "../../types/climate.types";

// Annual SOI (positive = La Niña phase)
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

// Nino 3.4 SST seasonal (used as ENSO seasonal proxy)
const SOI_SEASONAL: Record<string, Record<number, number>> = {
  DJF: {
    1990: 26.66, 1991: 27.02, 1992: 28.40, 1993: 26.76, 1994: 26.74, 1995: 27.64, 1996: 25.74, 1997: 26.11,
    1998: 28.87, 1999: 25.07, 2000: 24.95, 2001: 25.87, 2002: 26.43, 2003: 27.50, 2004: 26.94, 2005: 27.22,
    2006: 25.80, 2007: 27.29, 2008: 24.98, 2009: 25.79, 2010: 28.14, 2011: 25.21, 2012: 25.76, 2013: 26.20,
    2014: 26.21, 2015: 27.18, 2016: 29.13, 2017: 26.30, 2018: 25.72, 2019: 27.38, 2020: 27.13, 2021: 25.58,
    2022: 25.67, 2023: 25.96, 2024: 28.41, 2025: 26.04,
  },
  MAM: {
    1990: 27.75, 1991: 27.84, 1992: 28.89, 1993: 28.26, 1994: 27.90, 1995: 27.89, 1996: 27.19, 1997: 27.87,
    1998: 28.58, 1999: 26.61, 2000: 26.77, 2001: 27.24, 2002: 27.79, 2003: 27.55, 2004: 27.76, 2005: 28.02,
    2006: 27.31, 2007: 27.35, 2008: 26.66, 2009: 27.35, 2010: 28.03, 2011: 26.94, 2012: 27.20, 2013: 27.38,
    2014: 27.72, 2015: 28.37, 2016: 28.62, 2017: 27.88, 2018: 27.17, 2019: 28.34, 2020: 27.87, 2021: 27.02,
    2022: 26.61, 2023: 27.84, 2024: 28.39, 2025: 27.59,
  },
  JJA: {
    1990: 27.36, 1991: 27.94, 1992: 27.57, 1993: 27.53, 1994: 27.65, 1995: 26.97, 1996: 26.93, 1997: 28.81,
    1998: 26.40, 1999: 26.10, 2000: 26.65, 2001: 27.20, 2002: 28.06, 2003: 27.35, 2004: 27.75, 2005: 27.21,
    2006: 27.40, 2007: 26.74, 2008: 26.92, 2009: 27.75, 2010: 26.24, 2011: 26.81, 2012: 27.54, 2013: 26.89,
    2014: 27.34, 2015: 28.81, 2016: 26.93, 2017: 27.43, 2018: 27.38, 2019: 27.57, 2020: 26.88, 2021: 26.89,
    2022: 26.49, 2023: 28.36, 2024: 27.32, 2025: 27.10,
  },
  SON: {
    1990: 26.89, 1991: 27.54, 1992: 26.50, 1993: 26.85, 1994: 27.49, 1995: 25.77, 1996: 26.28, 1997: 29.02,
    1998: 25.32, 1999: 25.41, 2000: 26.05, 2001: 26.47, 2002: 27.98, 2003: 27.06, 2004: 27.44, 2005: 26.48,
    2006: 27.47, 2007: 25.37, 2008: 26.36, 2009: 27.72, 2010: 25.07, 2011: 25.70, 2012: 26.98, 2013: 26.54,
    2014: 27.21, 2015: 29.14, 2016: 26.02, 2017: 26.06, 2018: 27.47, 2019: 27.06, 2020: 25.54, 2021: 25.90,
    2022: 25.73, 2023: 28.49, 2024: 26.45, 2025: 26.16,
  },
};

// Annual DMI (positive = warm western Indian Ocean / positive IOD)
const DMI_ANNUAL: Record<number, number> = {
  1958: 0.10, 1959: -0.05, 1960: 0.15, 1961: 0.20, 1962: 0.05,
  1963: 0.35, 1964: -0.10, 1965: 0.10, 1966: -0.15, 1967: 0.05,
  1968: 0.10, 1969: 0.25, 1970: -0.20, 1971: 0.05, 1972: 0.30,
  1973: -0.25, 1974: 0.05, 1975: -0.10, 1976: 0.15, 1977: 0.20,
  1978: -0.05, 1979: 0.10, 1980: 0.15, 1981: 0.10, 1982: 0.20,
  1983: 0.25, 1984: 0.05, 1985: 0.15, 1986: 0.20, 1987: 0.30,
  1988: -0.10, 1989: 0.05, 1990: 0.05, 1991: -0.10, 1992: -0.25,
  1993: 0.15, 1994: 0.52, 1995: -0.05, 1996: -0.30, 1997: 0.65,
  1998: -0.20, 1999: -0.15, 2000: 0.10, 2001: 0.20, 2002: 0.30,
  2003: 0.15, 2004: 0.10, 2005: 0.20, 2006: 0.42, 2007: 0.15,
  2008: -0.10, 2009: 0.25, 2010: -0.35, 2011: -0.10, 2012: 0.45,
  2013: 0.10, 2014: 0.25, 2015: 0.20, 2016: -0.25, 2017: 0.15,
  2018: 0.25, 2019: 0.60, 2020: -0.20, 2021: -0.15, 2022: -0.30,
  2023: 0.20, 2024: 0.10, 2025: 0.05,
};

const DMI_SEASONAL: Record<string, Record<number, number>> = {
      DJF: {
          1990: -0.185, 1991: -0.010, 1992: -0.209, 1993: -0.159, 1994: -0.109, 1995: 0.189, 1996: 0.012, 1997: -0.148,
          1998: 0.603, 1999: -0.168, 2000: -0.094, 2001: -0.232, 2002: -0.097, 2003: -0.127, 2004: 0.116, 2005: -0.272,
          2006: -0.247, 2007: 0.182, 2008: -0.061, 2009: 0.047, 2010: 0.159, 2011: 0.074, 2012: -0.053, 2013: 0.131,
          2014: -0.016, 2015: -0.133, 2016: 0.143, 2017: -0.098, 2018: 0.041, 2019: 0.371, 2020: 0.157, 2021: 0.108,
          2022: -0.086, 2023: 0.058, 2024: 0.648
      },
      MAM: {
          1990: -0.292, 1991: 0.210, 1992: -0.591, 1993: -0.168, 1994: 0.366, 1995: -0.174, 1996: -0.240, 1997: 0.041,
          1998: 0.044, 1999: -0.029, 2000: 0.131, 2001: 0.088, 2002: -0.224, 2003: -0.101, 2004: -0.189, 2005: -0.127,
          2006: -0.149, 2007: 0.162, 2008: 0.041, 2009: 0.161, 2010: 0.266, 2011: 0.144, 2012: -0.205, 2013: -0.240,
          2014: -0.100, 2015: -0.003, 2016: 0.008, 2017: 0.464, 2018: -0.027, 2019: 0.340, 2020: 0.102, 2021: 0.175,
          2022: -0.094, 2023: 0.473, 2024: 0.386
      },
      JJA: {
          1990: -0.402, 1991: 0.197, 1992: -0.703, 1993: -0.188, 1994: 0.600, 1995: -0.130, 1996: -0.573, 1997: 0.388,
          1998: -0.273, 1999: -0.003, 2000: 0.062, 2001: -0.105, 2002: -0.219, 2003: 0.126, 2004: -0.272, 2005: -0.302,
          2006: 0.070, 2007: 0.104, 2008: 0.195, 2009: -0.065, 2010: -0.068, 2011: 0.207, 2012: 0.400, 2013: -0.290,
          2014: -0.254, 2015: 0.363, 2016: -0.548, 2017: 0.431, 2018: 0.110, 2019: 0.546, 2020: 0.197, 2021: -0.110,
          2022: -0.259, 2023: 0.663, 2024: 0.166
      },
      SON: {
          1990: -0.207, 1991: 0.036, 1992: -0.620, 1993: -0.158, 1994: 0.508, 1995: -0.280, 1996: -0.872, 1997: 0.974,
          1998: -0.631, 1999: -0.119, 2000: -0.181, 2001: -0.306, 2002: 0.262, 2003: -0.154, 2004: -0.088, 2005: -0.414,
          2006: 0.502, 2007: 0.093, 2008: -0.004, 2009: -0.061, 2010: -0.400, 2011: 0.298, 2012: 0.154, 2013: -0.093,
          2014: 0.002, 2015: 0.375, 2016: -0.397, 2017: 0.113, 2018: 0.596, 2019: 0.897, 2020: -0.032, 2021: -0.027,
          2022: -0.427, 2023: 0.890, 2024: -0.155
      }
};

type Season = "DJF" | "MAM" | "JJA" | "SON";
const SEASONS: Season[] = ["DJF", "MAM", "JJA", "SON"];

interface Props {
  data: TimeSeriesPoint[];
  trend: TrendInfo | null;
  units: string;
  indexName: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function arrMean(arr: number[]) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function arrStd(arr: number[], m: number) {
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function normalizer(arr: number[]) {
  const m = arrMean(arr);
  const s = arrStd(arr, m);
  return { mean: m, std: s, norm: (v: number) => (s > 0 ? (v - m) / s : 0) };
}

// ── tooltip ───────────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label, suffix = " σ" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded shadow-lg px-3 py-2 text-xs text-slate-200">
      <p className="font-semibold text-slate-300 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: {p.value != null ? Number(p.value).toFixed(2) : "—"}{suffix}
        </p>
      ))}
    </div>
  );
};

// ── single sub-chart ──────────────────────────────────────────────────────────
interface SubChartProps {
  chartData: Record<string, number | null>[];
  tcKey: string;
  tcLabel: string;
  tcColor: string;
  indexLabel: string;
  hasTrend: boolean;
}

function SubChart({ chartData, tcKey, tcLabel, tcColor, indexLabel, hasTrend }: SubChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 2 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 9, fill: "#475569" }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
          tickFormatter={(v) => String(v)}
        />
        <YAxis
          tick={{ fontSize: 9, fill: "#475569" }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
          tickFormatter={(v) => v.toFixed(1)}
          label={{ value: "σ", angle: -90, position: "insideLeft", fontSize: 10, fill: "#475569", dy: 8 }}
          domain={[-3, 3]}
        />
        <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
        <Tooltip content={<DarkTooltip />} />
        <Bar
          dataKey={tcKey}
          name={tcLabel}
          fill={tcColor}
          opacity={0.55}
          radius={[1, 1, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="index"
          name={indexLabel}
          stroke="#60a5fa"
          dot={false}
          strokeWidth={1.8}
          connectNulls
        />
        {hasTrend && (
          <Line
            type="monotone"
            dataKey="trendLine"
            name="Trend"
            stroke="#f87171"
            dot={false}
            strokeDasharray="5 3"
            strokeWidth={1.4}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── raw (unnormalised) series chart ──────────────────────────────────────────
interface RawChartProps {
  chartData: Record<string, number | null>[];
  units: string;
  indexLabel: string;
  hasTrend: boolean;
}

function RawSeriesChart({ chartData, units, indexLabel, hasTrend }: RawChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 2 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 9, fill: "#475569" }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
          tickFormatter={(v) => String(v)}
        />
        <YAxis
          tick={{ fontSize: 9, fill: "#475569" }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
          tickFormatter={(v) => v.toFixed(1)}
          label={{ value: units, angle: -90, position: "insideLeft", fontSize: 10, fill: "#475569", dy: 20 }}
          width={36}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<DarkTooltip suffix={` ${units}`} />} />
        <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
        <Line
          type="monotone"
          dataKey="index"
          name={indexLabel}
          stroke="#60a5fa"
          dot={{ r: 2, fill: "#60a5fa" }}
          strokeWidth={1.8}
          connectNulls
        />
        {hasTrend && (
          <Line
            type="monotone"
            dataKey="trendLine"
            name="Trend"
            stroke="#f87171"
            dot={false}
            strokeDasharray="5 3"
            strokeWidth={1.4}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function SOIComparisonChart({ data, trend, units, indexName }: Props) {
  const [season, setSeason] = useState<Season>("DJF");

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        No time series data
      </div>
    );
  }

  const validData = data.filter((d) => d.value !== null);

  // Normalise the index series
  const { norm: normIdx, mean: idxMean, std: idxStd } = normalizer(validData.map((d) => d.value!));

  // Trend line in z-score space
  const addTrend = (year: number): number | null => {
    if (trend?.slope == null || !trend?.period || trend.period.length < 2) return null;
    const midYear = (trend.period[0] + trend.period[1]) / 2;
    const origTrend = idxMean + (trend.slope / 10) * (year - midYear);
    return normIdx(origTrend);
  };

  // SOI source for selected season (use annual SOI if seasonal unavailable for that year)
  const soiSource = SOI_SEASONAL[season] ?? {};
  const soiAnnualFallback = SOI_ANNUAL;
  const soiRaw = validData
    .map((d) => soiSource[d.year] ?? soiAnnualFallback[d.year])
    .filter((v): v is number => v != null);
  const { norm: normSoi } = soiRaw.length > 1 ? normalizer(soiRaw) : { norm: () => 0 };

  // DMI source
  const dmiSource = DMI_SEASONAL[season] ?? {};
  const dmiRaw = validData
    .map((d) => dmiSource[d.year] ?? DMI_ANNUAL[d.year])
    .filter((v): v is number => v != null);
  const { norm: normDmi } = dmiRaw.length > 1 ? normalizer(dmiRaw) : { norm: () => 0 };

  // Raw (unnormalised) chart data
  const rawChartData = validData.map((d) => ({
    year: d.year,
    index: d.value,
    trendLine: addTrend(d.year) != null
      ? idxMean + (trend!.slope! / 10) * (d.year - (trend!.period[0] + trend!.period[1]) / 2)
      : null,
  }));

  const soiChartData = validData.map((d) => {
    const rawSoi = soiSource[d.year] ?? soiAnnualFallback[d.year];
    return {
      year: d.year,
      index: normIdx(d.value!),
      soi: rawSoi != null ? normSoi(rawSoi) : null,
      trendLine: addTrend(d.year),
    };
  });

  const dmiChartData = validData.map((d) => ({
    year: d.year,
    index: normIdx(d.value!),
    dmi: DMI_ANNUAL[d.year] != null ? normDmi(DMI_ANNUAL[d.year]) : null,
    trendLine: addTrend(d.year),
  }));

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Raw time series ───────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {indexName} · {units}
          </span>
          {trend?.slope != null && (
            <span className={[
              "text-[10px] font-mono ml-auto",
              (trend.p_value ?? 1) < 0.05
                ? trend.slope > 0 ? "text-red-400" : "text-blue-400"
                : "text-slate-600",
            ].join(" ")}>
              {trend.slope > 0 ? "+" : ""}{trend.slope.toFixed(3)} {trend.units}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <RawSeriesChart
            chartData={rawChartData}
            units={units}
            indexLabel={indexName}
            hasTrend={trend?.slope != null}
          />
        </div>
      </div>

      {/* divider */}
      <div className="h-px bg-slate-700/60 shrink-0" />

      {/* ── SOI panel ─────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              vs ENSO / Niño 3.4
            </span>
          </div>
          <div className="flex items-center gap-1">
            {SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={[
                  "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                  season === s
                    ? "bg-violet-700 text-white border-violet-700"
                    : "text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <SubChart
            chartData={soiChartData}
            tcKey="soi"
            tcLabel={`Niño 3.4 (${season})`}
            tcColor="#7c3aed"
            indexLabel={indexName}
            hasTrend={trend?.slope != null}
          />
        </div>
      </div>

      {/* divider */}
      <div className="h-px bg-slate-700/60 shrink-0" />

      {/* ── IOD panel ─────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between gap-1.5 mb-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0 " />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              vs IOD / DMI
            </span>
          </div>
          <div className="flex items-center gap-1">
            {SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={[
                  "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                  season === s
                    ? "bg-violet-700 text-white border-violet-700"
                    : "text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <SubChart
            chartData={dmiChartData}
            tcKey="dmi"
            tcLabel="DMI"
            tcColor="#0d9488"
            indexLabel={indexName}
            hasTrend={trend?.slope != null}
          />
        </div>
      </div>

      {/* legend footnote */}
      <p className="text-[9px] text-slate-600 text-right shrink-0 -mt-1">
        All series z-score normalised (σ) · blue = {indexName} · red dashed = trend · bars = teleconnection
      </p>
    </div>
  );
}
