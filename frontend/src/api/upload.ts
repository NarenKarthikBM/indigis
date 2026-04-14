import client from "./client";
import type { Layer, NCInspectResult, UploadTask } from "../types/layer.types";

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

export async function uploadLayerAsync(
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<{ task_id: string }> {
  const res = await client.post("/layers/upload-async/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress(e) {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return res.data as { task_id: string };
}

export async function inspectNetCDF(file: File): Promise<NCInspectResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await client.post("/layers/inspect-nc/", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data as NCInspectResult;
}

export async function uploadNetCDF(payload: {
  tmp_nc_path: string;
  variables: string[];
  metadata: Record<string, string>;
}): Promise<{ tasks: Array<{ variable: string; task_id: string }> }> {
  const res = await client.post("/layers/upload-nc/", payload);
  return res.data;
}

export async function pollTaskStatus(taskId: string): Promise<UploadTask> {
  const res = await client.get(`/layers/upload-tasks/${taskId}/status/`);
  return res.data as UploadTask;
}
