import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData, D8FlowAccumulationConfig } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

const METHOD_LABEL: Record<string, string> = {
  d8: "D8",
  taudem: "TauDEM",
  arcgis: "ArcGIS",
};

export default function D8FlowAccumulationNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const config = data.config as D8FlowAccumulationConfig;
  const method = config.method ?? "d8";

  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="processing">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>
        Method: {METHOD_LABEL[method] ?? method}
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
