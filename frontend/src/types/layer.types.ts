export interface LayerCategory {
  slug: string;
  name: string;
  overlay_type: "core" | "community";
  description: string;
}

export interface RasterAsset {
  id: number;
  cog_url: string;
  period_label: string;
  created_at: string;
}

export interface VectorLayerInfo {
  geometry_type: string;
  min_zoom: number;
  max_zoom: number;
  default_style: Record<string, unknown>;
  source_attribution: string;
}

export interface Layer {
  id: number;
  slug: string;
  label: string;
  category: LayerCategory | null;
  layer_type: "raster" | "vector";
  temporal_type: "static" | "annual" | "monthly";
  default_colormap: { name: string };
  min_value: number | null;
  max_value: number | null;
  description: string;
  data_source: string;
  resolution: string;
  temporal_coverage: string;
  is_active: boolean;
  raster_assets: RasterAsset[];
  vector_layer: VectorLayerInfo | null;
  spatial_resolution_m: number | null;
  native_crs: string;
  bbox: { minx: number; miny: number; maxx: number; maxy: number } | null;
  band_count: number | null;
  pixel_dtype: string;
  date_start: string | null;  // ISO date string YYYY-MM-DD
  date_end: string | null;
}

export interface BandConfig {
  bandIndex: number;
  visible: boolean;
  colormap: string;
  opacity: number;
  tileUrl: string | null;
}

export interface LayerConfig {
  layerId: number;
  slug: string;
  visible: boolean;
  opacity: number;
  colormap: string;
  tileUrl: string | null;
  multiBandMode?: boolean;
  bandConfigs?: BandConfig[];
  compositeMode?: boolean;
  compositeBands?: [number, number, number];
}

export interface TileURLResponse {
  tile_url: string;
  colormap: string;
  min_value: number | null;
  max_value: number | null;
  label: string;
}
