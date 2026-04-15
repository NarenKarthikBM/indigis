export interface RegionStatsResponse {
  layer_slug: string;
  layer_label: string;
  period_label: string | null;
  available_periods: string[];
  mean: number | null;
  min: number | null;
  max: number | null;
  std: number | null;
  variance: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  count: number | null;
  sum: number | null;
  cv: number | null;
  histogram: { bins: number[]; counts: number[] } | null;
}
