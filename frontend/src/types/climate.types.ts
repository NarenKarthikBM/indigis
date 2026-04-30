export type ETCCDIIndexName =
  | "TXx" | "TNn" | "TNx" | "TXn"
  | "TX90p" | "TN10p" | "WSDI" | "CSDI"
  | "SDII" | "RX1day" | "RX5day" | "R10mm" | "R20mm" | "CWD" | "CDD"
  | "R95p" | "R99p";

export type TeleconnectionName = "SOI" | "MEI" | "DMI";
export type SeasonalSOISeason = "DJF" | "MAM" | "JJA" | "SON";
export type SeasonalSOIKey = `SOI_${SeasonalSOISeason}`;
export type SeasonalDMISeason = "DJF" | "MAM" | "JJA" | "SON";
export type SeasonalDMIKey = `DMI_${SeasonalDMISeason}`;

export type ClimateMetric =
  | "trend_slope"
  | "latest_value"
  | "corr_soi"
  | "corr_soi_djf"
  | "corr_soi_mam"
  | "corr_soi_jja"
  | "corr_soi_son"
  | "corr_mei"
  | "corr_iod"
  | "corr_iod_djf"
  | "corr_iod_mam"
  | "corr_iod_jjas"
  | "corr_iod_jja"
  | "corr_iod_son";

export type ClimateLevel = "district" | "state";

export interface TimeSeriesPoint {
  year: number;
  value: number | null;
}

export interface TrendInfo {
  slope: number | null;
  p_value: number | null;
  units: string;
  period: [number, number];
}

export interface ReturnPeriods {
  rp_10: number | null;
  rp_25: number | null;
  rp_50: number | null;
  rp_100: number | null;
}

export interface CorrelationInfo {
  r: number | null;
  period: [number, number];
  n_years: number;
  season?: string;
}

export interface ETCCDIIndex {
  name: ETCCDIIndexName;
  label: string;
  units: string;
  description: string;
  tier: 1 | 2;
  colormap: string;
  has_trend: boolean;
  has_gev: boolean;
  has_correlation: Partial<Record<TeleconnectionName, boolean>>;
  has_seasonal_correlation: Partial<Record<SeasonalSOISeason, boolean>>;
  available_years: number[];
}

export interface IndexProfile {
  time_series: TimeSeriesPoint[];
  trend: TrendInfo | null;
  return_periods: ReturnPeriods | null;
  correlations: Partial<Record<TeleconnectionName | SeasonalSOIKey | SeasonalDMIKey, CorrelationInfo>> | null;
  latest_value: number | null;
  units: string;
}

export interface DistrictSummary {
  code: string;
  name: string;
  state_name: string;
  state_code: string;
}

export interface DistrictProfile {
  district: DistrictSummary;
  indices: Partial<Record<ETCCDIIndexName, IndexProfile>>;
}

export interface RankingRow {
  rank: number;
  district_code: string;
  district_name: string;
  state_name: string;
  value: number | null;
}

// ------------------------------------------------------------------
// Lightweight boundary types (no climate values embedded)
// ------------------------------------------------------------------

export interface BoundaryFeatureProperties {
  code: string;
  name: string;
  state?: string;
  state_code?: string;
}

export interface BoundaryFeature {
  type: "Feature";
  geometry: Record<string, unknown>;
  properties: BoundaryFeatureProperties;
}

export interface BoundaryFeatureCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

/** code → mean value (null when no data for that region) */
export type ValuesMap = Record<string, number | null>;

export interface ValuesResponse {
  values: ValuesMap;
  meta: {
    index: string;
    metric: string;
    level: string;
    asset_id: number;
    period_label: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChoroplethFeatureProperties {
  code: string;
  name: string;
  state?: string;
  state_code?: string;
  value: number | null;
  parameters: Record<string, unknown>;
}

export interface ChoroplethResponse {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  meta: {
    index: string;
    metric: string;
    level: string;
    asset_id: number;
    period_label: string;
    parameters: Record<string, unknown>;
  };
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: Record<string, unknown>;
  properties: ChoroplethFeatureProperties;
}
