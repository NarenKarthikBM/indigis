import type { Layer, LayerConfig, BandConfig } from "../types/layer.types";

const BAND_COLORMAP_CYCLE = ["reds", "greens", "blues", "oranges", "purples", "greys"];

export interface LayersState {
  availableLayers: Layer[];
  layerConfigs: Record<string, LayerConfig>;
  layerOrder: string[];
  setAvailableLayers: (layers: Layer[]) => void;
  toggleLayer: (slug: string, layerId: number) => void;
  reorderLayers: (newOrder: string[]) => void;
  setLayerOpacity: (slug: string, opacity: number) => void;
  setLayerColormap: (slug: string, colormap: string) => void;
  setLayerTileUrl: (slug: string, tileUrl: string) => void;
  removeLayer: (slug: string) => void;
  setMultiBandMode: (slug: string, enabled: boolean) => void;
  setBandConfig: (slug: string, bandIndex: number, partial: Partial<BandConfig>) => void;
  setBandTileUrl: (slug: string, bandIndex: number, tileUrl: string) => void;
  setCompositeMode: (slug: string, enabled: boolean) => void;
  setCompositeBands: (slug: string, bands: [number, number, number]) => void;
  setSelectedPeriodLabel: (slug: string, periodLabel: string | null) => void;
}

export const createLayersSlice = (
  set: (fn: (state: LayersState) => Partial<LayersState>) => void,
  get: () => LayersState
): LayersState => ({
  availableLayers: [],
  layerConfigs: {},
  layerOrder: [],

  setAvailableLayers: (layers) => set(() => ({ availableLayers: layers })),

  toggleLayer: (slug, layerId) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (existing) {
        const nowVisible = !existing.visible;
        const newOrder = nowVisible
          ? [...state.layerOrder, slug]
          : state.layerOrder.filter((s) => s !== slug);
        return {
          layerConfigs: {
            ...state.layerConfigs,
            [slug]: { ...existing, visible: nowVisible },
          },
          layerOrder: newOrder,
        };
      }
      const layer = state.availableLayers.find((l) => l.slug === slug);
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: {
            layerId,
            slug,
            visible: true,
            opacity: 0.8,
            colormap: layer?.default_colormap?.name || "viridis",
            tileUrl: null,
          },
        },
        layerOrder: [...state.layerOrder, slug],
      };
    }),

  reorderLayers: (newOrder) => set(() => ({ layerOrder: newOrder })),

  setLayerOpacity: (slug, opacity) =>
    set((state) => ({
      layerConfigs: {
        ...state.layerConfigs,
        [slug]: { ...state.layerConfigs[slug], opacity },
      },
    })),

  setLayerColormap: (slug, colormap) =>
    set((state) => ({
      layerConfigs: {
        ...state.layerConfigs,
        [slug]: { ...state.layerConfigs[slug], colormap, tileUrl: null },
      },
    })),

  setLayerTileUrl: (slug, tileUrl) =>
    set((state) => ({
      layerConfigs: {
        ...state.layerConfigs,
        [slug]: { ...state.layerConfigs[slug], tileUrl },
      },
    })),

  removeLayer: (slug) =>
    set((state) => {
      const configs = { ...state.layerConfigs };
      delete configs[slug];
      return { layerConfigs: configs, layerOrder: state.layerOrder.filter((s) => s !== slug) };
    }),

  setMultiBandMode: (slug, enabled) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (!existing) return {};
      if (!enabled) {
        return {
          layerConfigs: {
            ...state.layerConfigs,
            [slug]: { ...existing, multiBandMode: false, bandConfigs: undefined },
          },
        };
      }
      // Disable composite mode when enabling multi-band
      const base = { ...existing, compositeMode: false, compositeBands: undefined };
      // Initialize band configs if not already set
      if (existing.bandConfigs?.length) {
        return {
          layerConfigs: {
            ...state.layerConfigs,
            [slug]: { ...base, multiBandMode: true },
          },
        };
      }
      const layer = state.availableLayers.find((l) => l.slug === slug);
      const bandCount = layer?.band_count ?? 1;
      const bandConfigs: BandConfig[] = Array.from({ length: bandCount }, (_, i) => ({
        bandIndex: i + 1,
        visible: i < 3,
        colormap: BAND_COLORMAP_CYCLE[i % BAND_COLORMAP_CYCLE.length],
        opacity: 0.5,
        tileUrl: null,
      }));
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: { ...base, multiBandMode: true, bandConfigs },
        },
      };
    }),

  setBandConfig: (slug, bandIndex, partial) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (!existing?.bandConfigs) return {};
      const bandConfigs = existing.bandConfigs.map((bc) =>
        bc.bandIndex === bandIndex ? { ...bc, ...partial } : bc
      );
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: { ...existing, bandConfigs },
        },
      };
    }),

  setBandTileUrl: (slug, bandIndex, tileUrl) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (!existing?.bandConfigs) return {};
      const bandConfigs = existing.bandConfigs.map((bc) =>
        bc.bandIndex === bandIndex ? { ...bc, tileUrl } : bc
      );
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: { ...existing, bandConfigs },
        },
      };
    }),

  setCompositeMode: (slug, enabled) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (!existing) return {};
      if (enabled) {
        return {
          layerConfigs: {
            ...state.layerConfigs,
            [slug]: {
              ...existing,
              compositeMode: true,
              multiBandMode: false,
              bandConfigs: undefined,
              compositeBands: [1, 2, 3],
              tileUrl: null,
            },
          },
        };
      }
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: { ...existing, compositeMode: false, compositeBands: undefined },
        },
      };
    }),

  setCompositeBands: (slug, bands) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (!existing) return {};
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: { ...existing, compositeBands: bands, tileUrl: null },
        },
      };
    }),

  setSelectedPeriodLabel: (slug, periodLabel) =>
    set((state) => {
      const existing = state.layerConfigs[slug];
      if (!existing) return {};
      return {
        layerConfigs: {
          ...state.layerConfigs,
          [slug]: { ...existing, selectedPeriodLabel: periodLabel, tileUrl: null },
        },
      };
    }),
});
