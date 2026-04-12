import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

export default function ClipNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="processing">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>raster ∩ mask</span>
      <Handle
        type="target"
        position={Position.Left}
        id="raster_in"
        style={{ background: "#22c55e", top: "35%", width: 10, height: 10 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="vector_in"
        style={{ background: "#3b82f6", top: "65%", width: 10, height: 10 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="raster_out"
        style={{ background: "#22c55e", width: 10, height: 10 }}
      />
    </BaseNode>
  );
}
