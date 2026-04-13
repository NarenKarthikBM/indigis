import type { NodeStatus } from "../../../types/workflow.types";

interface BaseNodeProps {
  label: string;
  status: NodeStatus;
  selected?: boolean;
  children?: React.ReactNode;
  category: "input" | "operators" | "processing" | "output";
}

const CATEGORY_ACCENT: Record<string, string> = {
  input: "#3b82f6",
  operators: "#f59e0b",
  processing: "#8B5CF6",
  output: "#22c55e",
};

const STATUS_BORDER: Record<NodeStatus, string> = {
  idle: "#253244",
  running: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
};

export default function BaseNode({
  label,
  status,
  selected,
  children,
  category,
}: BaseNodeProps) {
  const accent = CATEGORY_ACCENT[category] || "#8B5CF6";
  const border = selected ? accent : STATUS_BORDER[status];
  const pulse = status === "running" ? "node-pulse" : "";

  return (
    <div
      className={`wf-node ${pulse}`}
      style={{
        background: "#1a2535",
        border: `2px solid ${border}`,
        borderRadius: 8,
        minWidth: 160,
        fontSize: 12,
        color: "#e2e8f0",
        boxShadow: selected
          ? `0 0 0 2px ${accent}44`
          : "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: accent + "22",
          borderBottom: `1px solid ${accent}44`,
          padding: "6px 10px",
          borderRadius: "6px 6px 0 0",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 11 }}>
          {label}
        </span>
        {status !== "idle" && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              color: STATUS_BORDER[status],
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {status}
          </span>
        )}
      </div>
      {/* Body */}
      {children && (
        <div style={{ padding: "6px 10px 8px" }}>{children}</div>
      )}
    </div>
  );
}
