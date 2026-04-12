import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData, NDVIConfig } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

export default function NDVINode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const config = data.config as NDVIConfig;
  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="processing">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>
        NIR:{config.nir_band ?? 4} Red:{config.red_band ?? 3}
      </span>
      <Handle
        type="target"
        position={Position.Left}
        id="raster_in"
        style={{ background: "#22c55e", width: 10, height: 10 }}
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
