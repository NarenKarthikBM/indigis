import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData, ZonalStatsConfig } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

export default function ZonalStatsNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const config = data.config as ZonalStatsConfig;
  const stats = config.stats?.join(", ") || "mean, min, max";
  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="processing">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>{stats}</span>
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
        id="vector_out"
        style={{ background: "#3b82f6", width: 10, height: 10 }}
      />
    </BaseNode>
  );
}
