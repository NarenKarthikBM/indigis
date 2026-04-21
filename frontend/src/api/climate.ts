import axios from "axios";
import type {
  ETCCDIIndex,
  ETCCDIIndexName,
  ClimateMetric,
  ClimateLevel,
  ChoroplethResponse,
  DistrictProfile,
  RankingRow,
} from "../types/climate.types";

const BASE = import.meta.env.VITE_API_BASE || "/api/v1";

export const climateApi = {
  fetchIndices(): Promise<ETCCDIIndex[]> {
    return axios.get(`${BASE}/climate/indices/`).then((r) => r.data);
  },

  fetchChoropleth(
    index: ETCCDIIndexName,
    metric: ClimateMetric,
    level: ClimateLevel,
    year?: number
  ): Promise<ChoroplethResponse> {
    const params: Record<string, string> = { index, metric, level };
    if (year !== undefined) params.year = String(year);
    return axios.get(`${BASE}/climate/choropleth/`, { params }).then((r) => r.data);
  },

  fetchDistrictProfile(
    districtCode: string,
    indices?: ETCCDIIndexName[]
  ): Promise<DistrictProfile> {
    const params: Record<string, string> = {};
    if (indices?.length) params.indices = indices.join(",");
    return axios
      .get(`${BASE}/climate/profile/${districtCode}/`, { params })
      .then((r) => r.data);
  },

  fetchRankings(
    index: ETCCDIIndexName,
    metric: ClimateMetric,
    level: ClimateLevel,
    limit = 20,
    ascending = false
  ): Promise<{ results: RankingRow[]; meta: Record<string, unknown> }> {
    return axios
      .get(`${BASE}/climate/rankings/`, {
        params: { index, metric, level, limit, ascending },
      })
      .then((r) => r.data);
  },
};
