import { useCallback } from "react";
import { useStore } from "../store";
import { fetchTileURL } from "../api/layers";

export function useLayerManager() {
  const {
    toggleLayer,
    setLayerTileUrl,
    setLayerColormap,
    setMultiBandMode,
    setBandConfig,
    setBandTileUrl,
    setCompositeMode,
    setCompositeBands,
    setSelectedPeriodLabel,
    layerConfigs,
    availableLayers,
  } = useStore();

  const handleToggle = useCallback(
    async (slug: string, layerId: number) => {
      const existing = layerConfigs[slug];
      const willBeVisible = !existing?.visible;

      toggleLayer(slug, layerId);

      if (willBeVisible) {
        const layer = availableLayers.find((l) => l.slug === slug);
        if (!layer || layer.layer_type !== "raster") return;

        try {
          const colormap = existing?.colormap || layer.default_colormap?.name || "viridis";
          const periodLabel = existing?.selectedPeriodLabel ?? undefined;
          const data = await fetchTileURL(slug, colormap, undefined, undefined, periodLabel);
          setLayerTileUrl(slug, data.tile_url);
        } catch (err) {
          console.error(`Failed to fetch tile URL for ${slug}:`, err);
        }
      }
    },
    [toggleLayer, setLayerTileUrl, layerConfigs, availableLayers]
  );

  const handleColormapChange = useCallback(
    async (slug: string, colormap: string) => {
      setLayerColormap(slug, colormap);
      try {
        const data = await fetchTileURL(slug, colormap);
        setLayerTileUrl(slug, data.tile_url);
      } catch (err) {
        console.error(`Failed to fetch tile URL for ${slug} with colormap ${colormap}:`, err);
      }
    },
    [setLayerColormap, setLayerTileUrl]
  );

  const handleEnableMultiBand = useCallback(
    async (slug: string) => {
      setCompositeMode(slug, false);
      setMultiBandMode(slug, true);
      // After enabling, fetch tile URLs for each visible band
      const config = layerConfigs[slug];
      const layer = availableLayers.find((l) => l.slug === slug);
      if (!layer) return;

      const bandCount = layer.band_count ?? 1;
      const colormapCycle = ["reds", "greens", "blues", "oranges", "purples", "greys"];
      const bandConfigs = config?.bandConfigs?.length
        ? config.bandConfigs
        : Array.from({ length: bandCount }, (_, i) => ({
            bandIndex: i + 1,
            visible: i < 3,
            colormap: colormapCycle[i % colormapCycle.length],
            opacity: 0.5,
            tileUrl: null,
          }));

      const rescale =
        layer.min_value != null && layer.max_value != null
          ? `${layer.min_value},${layer.max_value}`
          : undefined;

      for (const bc of bandConfigs) {
        if (!bc.visible) continue;
        try {
          const data = await fetchTileURL(slug, bc.colormap, rescale, [bc.bandIndex]);
          setBandTileUrl(slug, bc.bandIndex, data.tile_url);
        } catch (err) {
          console.error(`Failed to fetch band ${bc.bandIndex} tile for ${slug}:`, err);
        }
      }
    },
    [setCompositeMode, setMultiBandMode, setBandTileUrl, layerConfigs, availableLayers]
  );

  const handleBandConfigChange = useCallback(
    async (slug: string, bandIndex: number, changes: { visible?: boolean; colormap?: string; opacity?: number }) => {
      setBandConfig(slug, bandIndex, changes);

      const layer = availableLayers.find((l) => l.slug === slug);
      const config = layerConfigs[slug];
      const bc = config?.bandConfigs?.find((b) => b.bandIndex === bandIndex);
      if (!layer || !bc) return;

      const willBeVisible = changes.visible ?? bc.visible;
      const colormapChanged = changes.colormap && changes.colormap !== bc.colormap;

      if (willBeVisible && (colormapChanged || changes.visible === true)) {
        const colormap = changes.colormap ?? bc.colormap;
        const rescale =
          layer.min_value != null && layer.max_value != null
            ? `${layer.min_value},${layer.max_value}`
            : undefined;
        try {
          const data = await fetchTileURL(slug, colormap, rescale, [bandIndex]);
          setBandTileUrl(slug, bandIndex, data.tile_url);
        } catch (err) {
          console.error(`Failed to fetch band ${bandIndex} tile for ${slug}:`, err);
        }
      }
    },
    [setBandConfig, setBandTileUrl, layerConfigs, availableLayers]
  );

  const handleEnableComposite = useCallback(
    async (slug: string) => {
      setCompositeMode(slug, true);
      const layer = availableLayers.find((l) => l.slug === slug);
      if (!layer) return;
      const rescale =
        layer.min_value != null && layer.max_value != null
          ? `${layer.min_value},${layer.max_value}`
          : undefined;
      try {
        const data = await fetchTileURL(slug, undefined, rescale, [1, 2, 3]);
        setLayerTileUrl(slug, data.tile_url);
      } catch (err) {
        console.error(`Failed to fetch composite tile for ${slug}:`, err);
      }
    },
    [setCompositeMode, setLayerTileUrl, availableLayers]
  );

  const handleCompositeBandChange = useCallback(
    async (slug: string, bands: [number, number, number]) => {
      setCompositeBands(slug, bands);
      const layer = availableLayers.find((l) => l.slug === slug);
      if (!layer) return;
      const rescale =
        layer.min_value != null && layer.max_value != null
          ? `${layer.min_value},${layer.max_value}`
          : undefined;
      try {
        const data = await fetchTileURL(slug, undefined, rescale, bands);
        setLayerTileUrl(slug, data.tile_url);
      } catch (err) {
        console.error(`Failed to fetch composite tile for ${slug}:`, err);
      }
    },
    [setCompositeBands, setLayerTileUrl, availableLayers]
  );

  const handlePeriodChange = useCallback(
    async (slug: string, periodLabel: string) => {
      setSelectedPeriodLabel(slug, periodLabel);
      const layer = availableLayers.find((l) => l.slug === slug);
      if (!layer) return;
      const config = layerConfigs[slug];
      const colormap = config?.colormap || layer.default_colormap?.name || "viridis";
      const rescale =
        layer.min_value != null && layer.max_value != null
          ? `${layer.min_value},${layer.max_value}`
          : undefined;
      try {
        const data = await fetchTileURL(slug, colormap, rescale, undefined, periodLabel);
        setLayerTileUrl(slug, data.tile_url);
      } catch (err) {
        console.error(`Failed to fetch tile URL for ${slug} period '${periodLabel}':`, err);
      }
    },
    [setSelectedPeriodLabel, setLayerTileUrl, layerConfigs, availableLayers]
  );

  return {
    handleToggle,
    handleColormapChange,
    handleEnableMultiBand,
    handleBandConfigChange,
    handleEnableComposite,
    handleCompositeBandChange,
    handlePeriodChange,
  };
}
