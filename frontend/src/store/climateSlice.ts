import { climateApi } from "../api/climate";
import type {
  ETCCDIIndex,
  ETCCDIIndexName,
  ClimateMetric,
  ClimateLevel,
  ChoroplethResponse,
  DistrictProfile,
  RankingRow,
} from "../types/climate.types";

export interface ClimateState {
  // Selections
  selectedIndex: ETCCDIIndexName;
  selectedMetric: ClimateMetric;
  selectedLevel: ClimateLevel;
  selectedDistrictCode: string | null;
  selectedYear: number;

  // Data
  availableIndices: ETCCDIIndex[];
  choroData: ChoroplethResponse | null;
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
  choroData: null,
  districtProfile: null,
  rankings: [],

  choroLoading: false,
  profileLoading: false,
  rankingsLoading: false,

  setSelectedIndex: (index) =>
    set(() => ({ selectedIndex: index, choroData: null, rankings: [] })),

  setSelectedMetric: (metric) =>
    set(() => ({ selectedMetric: metric, choroData: null, rankings: [] })),

  setSelectedLevel: (level) =>
    set(() => ({ selectedLevel: level, choroData: null, rankings: [] })),

  setSelectedDistrict: (code) =>
    set(() => ({
      selectedDistrictCode: code,
      districtProfile: code === null ? null : get().districtProfile,
    })),

  setSelectedYear: (year) =>
    set(() => ({ selectedYear: year, choroData: null })),

  fetchAvailableIndices: async () => {
    const indices = await climateApi.fetchIndices();
    set(() => ({ availableIndices: indices }));
  },

  fetchChoropleth: async () => {
    const { selectedIndex, selectedMetric, selectedLevel, selectedYear } = get();
    set(() => ({ choroLoading: true }));
    try {
      const data = await climateApi.fetchChoropleth(
        selectedIndex,
        selectedMetric,
        selectedLevel,
        selectedMetric === "latest_value" ? selectedYear : undefined
      );
      set(() => ({ choroData: data, choroLoading: false }));
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
