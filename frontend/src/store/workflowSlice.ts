import type { Edge } from "@xyflow/react";
import type { WFNode, WorkflowNodeType, NodeConfig, WorkflowResult, NodeStatus, SavedWorkflow, WorkflowNodeData, NodePaletteItem } from "../types/workflow.types";

export interface WorkflowState {
  wfNodes: WFNode[];
  wfEdges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  executionResult: WorkflowResult | null;
  // Phase 2: persistence
  currentWorkflowId: number | null;
  currentWorkflowName: string;
  isDirty: boolean;
  savedWorkflows: SavedWorkflow[];
  // Node catalog fetched from backend
  nodeCatalog: NodePaletteItem[];
  catalogMap: Record<string, NodePaletteItem>;

  setWfNodes: (nodes: WFNode[]) => void;
  setWfEdges: (edges: Edge[]) => void;
  addWfNode: (node: WFNode) => void;
  updateNodeConfig: (nodeId: string, config: NodeConfig) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  selectNode: (nodeId: string | null) => void;
  setIsExecuting: (value: boolean) => void;
  setExecutionResult: (result: WorkflowResult | null) => void;
  clearWorkflow: () => void;
  // Phase 2: persistence actions
  setCurrentWorkflow: (id: number | null, name: string) => void;
  setDirty: (dirty: boolean) => void;
  setSavedWorkflows: (list: SavedWorkflow[]) => void;
  loadWorkflow: (wf: SavedWorkflow) => void;
  setCatalog: (catalog: NodePaletteItem[]) => void;
}

const DEFAULT_NODES: WFNode[] = [
  {
    id: "raster-input-1",
    type: "raster_input",
    position: { x: 100, y: 100 },
    data: { nodeType: "raster_input", label: "Raster Input A", config: { layer_slug: "" }, status: "idle" },
  },
  {
    id: "raster-input-2",
    type: "raster_input",
    position: { x: 100, y: 280 },
    data: { nodeType: "raster_input", label: "Raster Input B", config: { layer_slug: "" }, status: "idle" },
  },
  {
    id: "difference-1",
    type: "difference",
    position: { x: 400, y: 190 },
    data: { nodeType: "difference", label: "Difference", config: {}, status: "idle" },
  },
  {
    id: "preview-output-1",
    type: "preview_output",
    position: { x: 700, y: 190 },
    data: { nodeType: "preview_output", label: "Preview Output", config: {}, status: "idle" },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e-raster1-diff", source: "raster-input-1", sourceHandle: "raster_out", target: "difference-1", targetHandle: "raster_a" },
  { id: "e-raster2-diff", source: "raster-input-2", sourceHandle: "raster_out", target: "difference-1", targetHandle: "raster_b" },
  { id: "e-diff-preview", source: "difference-1", sourceHandle: "raster_out", target: "preview-output-1", targetHandle: "input" },
];

export const createWorkflowSlice = (
  set: (fn: (state: WorkflowState) => Partial<WorkflowState>) => void
): WorkflowState => ({
  wfNodes: DEFAULT_NODES,
  wfEdges: DEFAULT_EDGES,
  selectedNodeId: null,
  isExecuting: false,
  executionResult: null,
  currentWorkflowId: null,
  currentWorkflowName: "",
  isDirty: false,
  savedWorkflows: [],
  nodeCatalog: [],
  catalogMap: {},

  setWfNodes: (nodes) => set(() => ({ wfNodes: nodes, isDirty: true })),
  setWfEdges: (edges) => set(() => ({ wfEdges: edges, isDirty: true })),

  addWfNode: (node) =>
    set((state) => ({ wfNodes: [...state.wfNodes, node], isDirty: true })),

  updateNodeConfig: (nodeId, config) =>
    set((state) => ({
      wfNodes: state.wfNodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
      ),
      isDirty: true,
    })),

  updateNodeStatus: (nodeId, status) =>
    set((state) => ({
      wfNodes: state.wfNodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, status } } : n
      ),
    })),

  selectNode: (nodeId) => set(() => ({ selectedNodeId: nodeId })),
  setIsExecuting: (value) => set(() => ({ isExecuting: value })),
  setExecutionResult: (result) => set(() => ({ executionResult: result })),

  clearWorkflow: () =>
    set(() => ({
      wfNodes: DEFAULT_NODES,
      wfEdges: DEFAULT_EDGES,
      selectedNodeId: null,
      executionResult: null,
      currentWorkflowId: null,
      currentWorkflowName: "",
      isDirty: false,
    })),

  setCurrentWorkflow: (id, name) => set(() => ({ currentWorkflowId: id, currentWorkflowName: name })),
  setDirty: (dirty) => set(() => ({ isDirty: dirty })),
  setSavedWorkflows: (list) => set(() => ({ savedWorkflows: list })),

  setCatalog: (catalog) =>
    set(() => ({
      nodeCatalog: catalog,
      catalogMap: Object.fromEntries(catalog.map((item) => [item.type, item])),
    })),

  loadWorkflow: (wf) =>
    set((state) => {
      const graph = wf.graph_data;
      const nodes: WFNode[] = (graph.nodes || []).map((n) => {
        const catalogEntry = state.catalogMap[n.type];
        return {
          id: n.id,
          type: n.type,
          position: n.position || { x: 0, y: 0 },
          data: {
            nodeType: n.type as WorkflowNodeType,
            label: n.label || catalogEntry?.label || n.type,
            config: n.config,
            status: "idle" as NodeStatus,
            inputs: catalogEntry?.inputs,
            outputs: catalogEntry?.outputs,
            category: catalogEntry?.category,
          },
        };
      });
      const edges: Edge[] = (graph.edges || []).map((e, i) => ({
        id: `e-${e.source}-${e.target}-${i}`,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      }));
      return {
        wfNodes: nodes,
        wfEdges: edges,
        selectedNodeId: null,
        executionResult: null,
        currentWorkflowId: wf.id,
        currentWorkflowName: wf.name,
        isDirty: false,
      };
    }),
});
