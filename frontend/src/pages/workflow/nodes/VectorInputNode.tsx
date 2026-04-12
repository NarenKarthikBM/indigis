import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

export default function VectorInputNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const config = data.config as { layer_slug?: string };
  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="input">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>
        {config.layer_slug || <em>no layer selected</em>}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id="vector_out"
        style={{ background: "#3b82f6", width: 10, height: 10 }}
      />
    </BaseNode>
  );
}
