import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useStore } from "../../store";
import { nodeTypes } from "./nodes/nodeTypes";
import type { WFNode, WorkflowNodeData, WorkflowNodeType } from "../../types/workflow.types";

let _nodeCounter = 0;
function nextNodeId() {
  return `node-${++_nodeCounter}`;
}

function WorkflowCanvasInner() {
  const wfNodes = useStore((s) => s.wfNodes);
  const wfEdges = useStore((s) => s.wfEdges);
  const setWfNodes = useStore((s) => s.setWfNodes);
  const setWfEdges = useStore((s) => s.setWfEdges);
  const selectNode = useStore((s) => s.selectNode);
  const addWfNode = useStore((s) => s.addWfNode);
  const catalogMap = useStore((s) => s.catalogMap);
  const { screenToFlowPosition } = useReactFlow();

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setWfNodes(applyNodeChanges(changes, wfNodes) as WFNode[]),
    [wfNodes, setWfNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setWfEdges(applyEdgeChanges(changes, wfEdges)),
    [wfEdges, setWfEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      // Edge type validation using catalog
      const { source, sourceHandle, target, targetHandle } = connection;
      if (!sourceHandle || !targetHandle || !source || !target) return;

      const srcNode = wfNodes.find((n) => n.id === source);
      const tgtNode = wfNodes.find((n) => n.id === target);
      if (!srcNode || !tgtNode) return;

      const srcCatalog = catalogMap[srcNode.data.nodeType];
      const tgtCatalog = catalogMap[tgtNode.data.nodeType];
      if (!srcCatalog || !tgtCatalog) return;

      const srcHandleSpec = srcCatalog.outputs.find((h) => h.handle === sourceHandle);
      const tgtHandleSpec = tgtCatalog.inputs.find((h) => h.handle === targetHandle);
      if (!srcHandleSpec || !tgtHandleSpec) return;

      const compatible =
        tgtHandleSpec.dataType === "any" ||
        srcHandleSpec.dataType === tgtHandleSpec.dataType;

      if (!compatible) {
        alert(
          `Type mismatch: cannot connect ${srcHandleSpec.dataType} output to ${tgtHandleSpec.dataType} input.`
        );
        return;
      }

      setWfEdges(addEdge(connection, wfEdges));
    },
    [wfNodes, wfEdges, setWfEdges, catalogMap]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: WFNode) => selectNode(node.id),
    [selectNode]
  );

  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData("application/wf-node-type") as WorkflowNodeType;
      if (!nodeType) return;

      const catalogItem = catalogMap[nodeType];
      if (!catalogItem) return;

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const newNode: WFNode = {
        id: nextNodeId(),
        type: nodeType,
        position,
        data: {
          nodeType,
          label: catalogItem.label,
          config: defaultConfig(nodeType),
          status: "idle",
          inputs: catalogItem.inputs,
          outputs: catalogItem.outputs,
          category: catalogItem.category,
        } as WorkflowNodeData,
      };
      addWfNode(newNode);
    },
    [screenToFlowPosition, addWfNode, catalogMap]
  );

  return (
    <div style={{ flex: 1, height: "100%", background: "#0f1724" }}>
      <ReactFlow
        nodes={wfNodes}
        edges={wfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick as any}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        style={{ background: "#0f1724" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#253244" gap={24} />
        <Controls
          style={{
            background: "#1a2535",
            border: "1px solid #253244",
            borderRadius: 8,
          }}

        />
        <MiniMap
          style={{ background: "#1a2535", border: "1px solid #253244" }}
          nodeColor="#8B5CF6"
          maskColor="rgba(0,0,0,0.4)"
        />
      </ReactFlow>
    </div>
  );
}

function defaultConfig(nodeType: WorkflowNodeType): Record<string, unknown> {
  switch (nodeType) {
    case "raster_input":
      return { layer_slug: "", band_mode: "all", selected_bands: [] };
    case "vector_input":
      return { layer_slug: "" };
    case "ndvi":
      return { nir_band: 4, red_band: 3 };
    case "reclassify":
      return { rules: [] };
    case "zonal_stats":
      return { stats: ["mean", "min", "max", "count"] };
    default:
      return {};
  }
}

export default function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
