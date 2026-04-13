import client from "./client";
import type { Layer, LayerCategory, TileURLResponse } from "../types/layer.types";

export async function fetchCategories(): Promise<LayerCategory[]> {
  const res = await client.get("/categories/");
  return res.data;
}

export async function fetchLayers(): Promise<Layer[]> {
  const res = await client.get("/layers/");
  return res.data;
}

export async function fetchTileURL(
  slug: string,
  colormap?: string,
  rescale?: string,
  bidx?: number[],
  periodLabel?: string,
): Promise<TileURLResponse> {
  const params: Record<string, string> = {};
  if (colormap) params.colormap = colormap;
  if (rescale) params.rescale = rescale;
  if (bidx?.length) params.bidx = bidx.join(",");
  if (periodLabel) params.period_label = periodLabel;
  const res = await client.get(`/layers/${slug}/tile-url/`, { params });
  return res.data;
}
