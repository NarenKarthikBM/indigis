import type { Node, Edge } from "@xyflow/react";

export type HandleDataType = "raster" | "vector" | "any";

export type WorkflowNodeType =
  | "raster_input"
  | "vector_input"
  | "difference"
  | "ndvi"
  | "reclassify"
  | "clip"
  | "zonal_stats"
  | "preview_output";

export interface RasterInputConfig {
  layer_slug: string;
  band_mode?: "all" | "single" | "multi";
  selected_bands?: number[];
}
export interface VectorInputConfig {
  layer_slug: string;
}
export interface DifferenceConfig {}
export interface NDVIConfig {
  nir_band: number;
  red_band: number;
}
export interface ReclassifyRule {
  min: number;
  max: number;
  new_value: number;
}
export interface ReclassifyConfig {
  rules: ReclassifyRule[];
}
export interface ClipConfig {}
export interface ZonalStatsConfig {
  stats: string[];
}
export interface PreviewOutputConfig {}

export type NodeConfig =
  | RasterInputConfig
  | VectorInputConfig
  | DifferenceConfig
  | NDVIConfig
  | ReclassifyConfig
  | ClipConfig
  | ZonalStatsConfig
  | PreviewOutputConfig;

export type NodeStatus = "idle" | "running" | "completed" | "failed";

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: WorkflowNodeType;
  label: string;
  config: NodeConfig;
  status: NodeStatus;
}

export type WFNode = Node<WorkflowNodeData>;

export interface WorkflowGraph {
  nodes: { id: string; type: WorkflowNodeType; config: NodeConfig }[];
  edges: {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }[];
}

export interface WorkflowResult {
  status: "completed" | "failed";
  result_type?: "raster" | "vector";
  tile_url?: string;
  bbox?:
    | { minx: number; miny: number; maxx: number; maxy: number }
    | [number, number, number, number];
  min_value?: number;
  max_value?: number;
  geojson?: GeoJSON.FeatureCollection;
  error?: string;
  failed_node_id?: string;
}

export interface NodeHandleSpec {
  handle: string;
  dataType: HandleDataType;
  label?: string;
}

export interface NodePaletteItem {
  type: WorkflowNodeType;
  label: string;
  category: "input" | "processing" | "output";
  description: string;
  inputs: NodeHandleSpec[];
  outputs: NodeHandleSpec[];
}

// --- Phase 2: Persistence types ---

export interface SavedWorkflow {
  id: number;
  name: string;
  description: string;
  owner_username: string;
  graph_data: {
    nodes: { id: string; type: WorkflowNodeType; config: NodeConfig; position: { x: number; y: number }; label: string }[];
    edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
  };
  created_at: string;
  updated_at: string;
}

export interface SaveAsLayerRequest {
  name: string;
  colormap?: string;
}
