import { climateApi } from "../api/climate";
import type {
  ETCCDIIndex,
  ETCCDIIndexName,
  ClimateMetric,
  ClimateLevel,
  BoundaryFeatureCollection,
  ValuesMap,
  DistrictProfile,
  RankingRow,
} from "../types/climate.types";

// ---------------------------------------------------------------------------
// Module-level caches — not reactive, never trigger re-renders
// ---------------------------------------------------------------------------
const _boundaryCache: Partial<Record<ClimateLevel, BoundaryFeatureCollection>> = {};
const _valuesCache = new Map<string, ValuesMap>();

function valuesKey(
  index: string,
  metric: string,
  level: string,
  year: number | undefined
): string {
  return `${index}|${metric}|${level}|${year ?? ""}`;
}

export interface ClimateState {
  // Selections
  selectedIndex: ETCCDIIndexName;
  selectedMetric: ClimateMetric;
  selectedLevel: ClimateLevel;
  selectedDistrictCode: string | null;
  selectedYear: number;

  // Data
  availableIndices: ETCCDIIndex[];
  /** Current level's boundary GeoJSON (geometry only, no values) */
  boundaryData: BoundaryFeatureCollection | null;
  /** Current displayed values: code → mean */
  activeValues: ValuesMap | null;
  districtProfile: DistrictProfile | null;
  rankings: RankingRow[];

  // Loading state
  choroLoading: boolean;
  profileLoading: boolean;
  rankingsLoading: boolean;

  // Actions
  setSelectedIndex: (index: ETCCDIIndexName) => void;
  setSelectedMetric: (metric: ClimateMetric) => void;
  setSelectedLevel: (level: ClimateLevel) => void;
  setSelectedDistrict: (code: string | null) => void;
  setSelectedYear: (year: number) => void;
  fetchAvailableIndices: () => Promise<void>;
  fetchChoropleth: () => Promise<void>;
  fetchDistrictProfile: (code: string) => Promise<void>;
  fetchRankings: () => Promise<void>;
}

export const createClimateSlice = (
  set: (fn: (state: ClimateState) => Partial<ClimateState>) => void,
  get: () => ClimateState
): ClimateState => ({
  selectedIndex: "TXx",
  selectedMetric: "latest_value",
  selectedLevel: "district",
  selectedDistrictCode: null,
  selectedYear: 2025,

  availableIndices: [],
  boundaryData: null,
  activeValues: null,
  districtProfile: null,
  rankings: [],

  choroLoading: false,
  profileLoading: false,
  rankingsLoading: false,

  // Setters no longer null boundary/values — old data stays visible while
  // new data loads, avoiding a blank-map flash.
  setSelectedIndex: (index) =>
    set(() => ({ selectedIndex: index, rankings: [] })),

  setSelectedMetric: (metric) =>
    set(() => ({ selectedMetric: metric, rankings: [] })),

  setSelectedLevel: (level) =>
    set(() => ({ selectedLevel: level, rankings: [] })),

  setSelectedDistrict: (code) =>
    set(() => ({
      selectedDistrictCode: code,
      districtProfile: code === null ? null : get().districtProfile,
    })),

  setSelectedYear: (year) =>
    set(() => ({ selectedYear: year })),

  fetchAvailableIndices: async () => {
    const indices = await climateApi.fetchIndices();
    set(() => ({ availableIndices: indices }));
  },

  fetchChoropleth: async () => {
    const { selectedIndex, selectedMetric, selectedLevel, selectedYear } = get();
    // For latest_value, don't pass a year — let the backend return the most recent asset.
    // Passing selectedYear (defaults 2025) would fail if no data exists for that year yet.
    const yearParam = undefined;
    const vKey = valuesKey(selectedIndex, selectedMetric, selectedLevel, yearParam);

    set(() => ({ choroLoading: true }));
    try {
      // 1. Boundary (geometry) — fetched once per level, then cached forever
      let boundary = _boundaryCache[selectedLevel];
      if (!boundary) {
        boundary = await climateApi.fetchBoundaries(selectedLevel);
        _boundaryCache[selectedLevel] = boundary;
      }

      // 2. Values — cached by composite key
      let values = _valuesCache.get(vKey);
      if (!values) {
        const resp = await climateApi.fetchValues(
          selectedIndex,
          selectedMetric,
          selectedLevel,
          yearParam
        );
        values = resp.values;
        _valuesCache.set(vKey, values);
      }

      set(() => ({ boundaryData: boundary!, activeValues: values!, choroLoading: false }));
    } catch (err) {
      set(() => ({ choroLoading: false }));
      console.error("fetchChoropleth failed:", err);
    }
  },

  fetchDistrictProfile: async (code: string) => {
    set(() => ({ profileLoading: true, selectedDistrictCode: code }));
    try {
      const data = await climateApi.fetchDistrictProfile(code);
      set(() => ({ districtProfile: data, profileLoading: false }));
    } catch (err) {
      set(() => ({ profileLoading: false }));
      console.error("fetchDistrictProfile failed:", err);
    }
  },

  fetchRankings: async () => {
    const { selectedIndex, selectedMetric, selectedLevel } = get();
    set(() => ({ rankingsLoading: true }));
    try {
      const { results } = await climateApi.fetchRankings(
        selectedIndex,
        selectedMetric,
        selectedLevel,
        20
      );
      set(() => ({ rankings: results, rankingsLoading: false }));
    } catch (err) {
      set(() => ({ rankingsLoading: false }));
      console.error("fetchRankings failed:", err);
    }
  },
});
