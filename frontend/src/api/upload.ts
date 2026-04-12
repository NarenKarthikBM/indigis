import client from "./client";
import type { Layer } from "../types/layer.types";

export interface RasterMetadata {
  native_crs: string;
  bbox: { minx: number; miny: number; maxx: number; maxy: number } | null;
  band_count: number | null;
  pixel_dtype: string;
  spatial_resolution_m: number | null;
  min_value: number | null;
  max_value: number | null;
  date_start: string | null;
  date_end: string | null;
}

export async function inspectLayer(file: File): Promise<RasterMetadata> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await client.post("/layers/inspect/", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data as RasterMetadata;
}

export async function uploadLayer(
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<Layer> {
  const res = await client.post("/layers/upload/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress(e) {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return res.data as Layer;
}
