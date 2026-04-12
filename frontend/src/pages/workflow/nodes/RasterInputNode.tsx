import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

export default function RasterInputNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const config = data.config as { layer_slug?: string; band_mode?: string; selected_bands?: number[] };

  let bandLabel = "";
  if (config.band_mode === "single" && config.selected_bands?.length === 1) {
    bandLabel = `Band ${config.selected_bands[0]}`;
  } else if (config.band_mode === "multi" && config.selected_bands?.length) {
    bandLabel = `Bands ${config.selected_bands.join(", ")}`;
  } else if (config.band_mode === "all" || !config.band_mode) {
    bandLabel = "All bands";
  }

  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category="input">
      <span style={{ color: "#94a3b8", fontSize: 10 }}>
        {config.layer_slug || <em>no layer selected</em>}
      </span>
      {config.layer_slug && bandLabel && (
        <span style={{ color: "#8B5CF6", fontSize: 9, marginTop: 2, display: "block" }}>
          {bandLabel}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="raster_out"
        style={{ background: "#22c55e", width: 10, height: 10 }}
      />
    </BaseNode>
  );
}
