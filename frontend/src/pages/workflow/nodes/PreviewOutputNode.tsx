import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

export default function PreviewOutputNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="output">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>map preview</span>
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ background: "#94a3b8", width: 10, height: 10 }}
      />
    </BaseNode>
  );
}
