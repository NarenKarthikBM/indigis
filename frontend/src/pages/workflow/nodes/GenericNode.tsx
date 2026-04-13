import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { WorkflowNodeData, NodeHandleSpec } from "../../../types/workflow.types";
import BaseNode from "./BaseNode";

const HANDLE_COLOR: Record<string, string> = {
  raster: "#22c55e",
  vector: "#3b82f6",
  any: "#f59e0b",
};

function handleTop(index: number, total: number): string {
  if (total === 1) return "50%";
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

export default function GenericNode({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const inputs: NodeHandleSpec[] = (data.inputs as NodeHandleSpec[]) ?? [];
  const outputs: NodeHandleSpec[] = (data.outputs as NodeHandleSpec[]) ?? [];
  const category = (data.category as "input" | "processing" | "output") ?? "processing";

  return (
    <BaseNode label={data.label} status={data.status} selected={selected} category={category}>
      {inputs.length > 0 && (
        <span style={{ color: "#94a3b8", fontSize: 10 }}>
          {inputs.map((i) => i.label ?? i.handle).join(" · ")}
        </span>
      )}
      {inputs.map((input, i) => (
        <Handle
          key={input.handle}
          type="target"
          position={Position.Left}
          id={input.handle}
          style={{
            background: HANDLE_COLOR[input.dataType] ?? "#94a3b8",
            width: 10,
            height: 10,
            top: handleTop(i, inputs.length),
          }}
        />
      ))}
      {outputs.map((output, i) => (
        <Handle
          key={output.handle}
          type="source"
          position={Position.Right}
          id={output.handle}
          style={{
            background: HANDLE_COLOR[output.dataType] ?? "#94a3b8",
            width: 10,
            height: 10,
            top: handleTop(i, outputs.length),
          }}
        />
      ))}
    </BaseNode>
  );
}
