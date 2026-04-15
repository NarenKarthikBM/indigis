import client from "./client";
import type { RegionStatsResponse } from "../types/stats.types";

interface FetchRegionStatsParams {
  layer_slug: string;
  state_code?: string;
  district_code?: string;
  period_label?: string;
}

export async function fetchRegionStats(
  params: FetchRegionStatsParams,
): Promise<RegionStatsResponse> {
  const query: Record<string, string> = { layer_slug: params.layer_slug };
  if (params.state_code) query.state_code = params.state_code;
  if (params.district_code) query.district_code = params.district_code;
  if (params.period_label) query.period_label = params.period_label;
  const res = await client.get("/stats/region/", { params: query });
  return res.data;
}

interface BuildExportUrlParams extends FetchRegionStatsParams {
  scope: "region" | "all";
}

export function buildExportUrl(params: BuildExportUrlParams): string {
  const query = new URLSearchParams({ layer_slug: params.layer_slug, scope: params.scope });
  if (params.state_code) query.set("state_code", params.state_code);
  if (params.district_code) query.set("district_code", params.district_code);
  if (params.period_label) query.set("period_label", params.period_label);
  return `/api/v1/stats/export/?${query.toString()}`;
}
