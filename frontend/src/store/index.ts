import { create } from "zustand";
import { createMapSlice, type MapState } from "./mapSlice";
import { createLayersSlice, type LayersState } from "./layersSlice";
import { createUISlice, type UIState } from "./uiSlice";
import { createAuthSlice, type AuthState } from "./authSlice";
import { createWorkflowSlice, type WorkflowState } from "./workflowSlice";
import { createUploadSlice, type UploadState } from "./uploadSlice";

type StoreState = MapState & LayersState & UIState & AuthState & WorkflowState & UploadState;

export const useStore = create<StoreState>((set, get) => ({
  ...createMapSlice((fn) => set((s) => fn(s as MapState) as StoreState)),
  ...createLayersSlice(
    (fn) => set((s) => fn(s as LayersState) as StoreState),
    () => get() as LayersState
  ),
  ...createUISlice((fn) => set((s) => fn(s as UIState) as StoreState)),
  ...createAuthSlice((fn) => set((s) => fn(s as AuthState) as StoreState)),
  ...createWorkflowSlice((fn) => set((s) => fn(s as WorkflowState) as StoreState)),
  ...createUploadSlice((fn) => set((s) => fn(s as UploadState) as StoreState)),
}));
