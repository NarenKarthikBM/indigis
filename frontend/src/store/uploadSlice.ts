import type { NCInspectResult, UploadTask } from "../types/layer.types";
import type { RasterMetadata } from "../api/upload";
import type { Step2FormData } from "../pages/upload/UploadStep2";

export type { RasterMetadata };

export interface UploadQueueItem {
  localId: string;
  file: File;
  fileType: "tiff" | "nc";
  status:
    | "idle"
    | "inspecting"
    | "configuring"
    | "uploading"
    | "processing"
    | "done"
    | "failed";
  httpUploadProgress: number;
  taskId: string | null;
  task: UploadTask | null;
  metadata: RasterMetadata | NCInspectResult | null;
  selectedVariables: string[];
  formData: Step2FormData | null;
  error: string | null;
}

export interface UploadState {
  uploadQueue: UploadQueueItem[];
  addToQueue: (item: UploadQueueItem) => void;
  updateQueueItem: (localId: string, patch: Partial<UploadQueueItem>) => void;
  removeFromQueue: (localId: string) => void;
  clearCompleted: () => void;
}

export function createUploadSlice(
  set: (fn: (state: UploadState) => UploadState) => void
): UploadState {
  return {
    uploadQueue: [],

    addToQueue(item) {
      set((s) => ({ ...s, uploadQueue: [...s.uploadQueue, item] }));
    },

    updateQueueItem(localId, patch) {
      set((s) => ({
        ...s,
        uploadQueue: s.uploadQueue.map((i) =>
          i.localId === localId ? { ...i, ...patch } : i
        ),
      }));
    },

    removeFromQueue(localId) {
      set((s) => ({
        ...s,
        uploadQueue: s.uploadQueue.filter((i) => i.localId !== localId),
      }));
    },

    clearCompleted() {
      set((s) => ({
        ...s,
        uploadQueue: s.uploadQueue.filter(
          (i) => i.status !== "done" && i.status !== "failed"
        ),
      }));
    },
  };
}
