import { useState } from "react";
import { useStore } from "../../store";
import { executeWorkflow, createWorkflow, updateWorkflow } from "../../api/workflows";
import type { WorkflowGraph } from "../../types/workflow.types";
import { Link } from "react-router-dom";

interface WorkflowToolbarProps {
  onOpenBrowser: () => void;
}

export default function WorkflowToolbar({ onOpenBrowser }: WorkflowToolbarProps) {
  const wfNodes = useStore((s) => s.wfNodes);
  const wfEdges = useStore((s) => s.wfEdges);
  const isExecuting = useStore((s) => s.isExecuting);
  const setIsExecuting = useStore((s) => s.setIsExecuting);
  const setExecutionResult = useStore((s) => s.setExecutionResult);
  const updateNodeStatus = useStore((s) => s.updateNodeStatus);
  const clearWorkflow = useStore((s) => s.clearWorkflow);
  const currentWorkflowId = useStore((s) => s.currentWorkflowId);
  const currentWorkflowName = useStore((s) => s.currentWorkflowName);
  const setCurrentWorkflow = useStore((s) => s.setCurrentWorkflow);
  const setDirty = useStore((s) => s.setDirty);
  const isDirty = useStore((s) => s.isDirty);

  const [nameValue, setNameValue] = useState(currentWorkflowName || "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Keep name input in sync when loading a workflow
  const displayName = currentWorkflowName !== nameValue && !isDirty ? currentWorkflowName : nameValue;

  function serializeGraph() {
    return {
      nodes: wfNodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        config: n.data.config,
        position: n.position,
        label: n.data.label,
      })),
      edges: wfEdges.map((e) => ({
        source: e.source,
        sourceHandle: e.sourceHandle ?? "",
        target: e.target,
        targetHandle: e.targetHandle ?? "",
      })),
    };
  }

  async function handleSave() {
    const name = (nameValue || displayName || "").trim();
    if (!name) {
      setSaveMsg("Enter a name");
      setTimeout(() => setSaveMsg(""), 2000);
      return;
    }
    if (wfNodes.length === 0) return;

    setSaving(true);
    try {
      const graph_data = serializeGraph();
      if (currentWorkflowId) {
        await updateWorkflow(currentWorkflowId, { name, graph_data });
      } else {
        const created = await createWorkflow({ name, graph_data });
        setCurrentWorkflow(created.id, created.name);
      }
      setDirty(false);
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err: any) {
      setSaveMsg("Save failed");
      setTimeout(() => setSaveMsg(""), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (isExecuting || wfNodes.length === 0) return;

    wfNodes.forEach((n) => updateNodeStatus(n.id, "idle"));
    setExecutionResult(null);
    setIsExecuting(true);

    const graph: WorkflowGraph & { workflow_id?: number } = {
      nodes: wfNodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        config: n.data.config,
      })),
      edges: wfEdges.map((e) => ({
        source: e.source,
        sourceHandle: e.sourceHandle ?? "",
        target: e.target,
        targetHandle: e.targetHandle ?? "",
      })),
    };

    if (currentWorkflowId) {
      graph.workflow_id = currentWorkflowId;
    }

    try {
      const result = await executeWorkflow(graph);
      if (result.status === "failed" && result.failed_node_id) {
        updateNodeStatus(result.failed_node_id, "failed");
      } else if (result.status === "completed") {
        wfNodes.forEach((n) => updateNodeStatus(n.id, "completed"));
      }
      setExecutionResult(result);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || "Execution failed";
      const failedId = err?.response?.data?.failed_node_id;
      if (failedId) updateNodeStatus(failedId, "failed");
      setExecutionResult({ status: "failed", error: msg });
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <div
      style={{
        height: 48,
        background: "#1a2535",
        borderBottom: "1px solid #253244",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <Link
        to="/"
        style={{
          color: "#94a3b8",
          fontSize: 12,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ← Map
      </Link>

      <div style={{ width: 1, height: 20, background: "#253244" }} />

      {/* Workflow name input */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="text"
          value={nameValue || currentWorkflowName}
          onChange={(e) => {
            setNameValue(e.target.value);
            if (e.target.value !== currentWorkflowName) setDirty(true);
          }}
          placeholder="Untitled Workflow"
          style={{
            background: "#0f1724",
            border: "1px solid #253244",
            borderRadius: 4,
            color: "#f1f5f9",
            padding: "4px 8px",
            fontSize: 13,
            fontWeight: 600,
            width: 200,
            outline: "none",
          }}
        />
        {isDirty && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#f59e0b",
              flexShrink: 0,
            }}
            title="Unsaved changes"
          />
        )}
        {saveMsg && (
          <span style={{ fontSize: 11, color: saveMsg === "Saved!" ? "#22c55e" : "#ef4444" }}>
            {saveMsg}
          </span>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving || wfNodes.length === 0}
          style={{
            background: "transparent",
            border: "1px solid #253244",
            borderRadius: 6,
            color: "#94a3b8",
            padding: "7px 14px",
            cursor: saving || wfNodes.length === 0 ? "not-allowed" : "pointer",
            fontSize: 13,
            opacity: wfNodes.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <button
          onClick={onOpenBrowser}
          style={{
            background: "transparent",
            border: "1px solid #253244",
            borderRadius: 6,
            color: "#94a3b8",
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Open
        </button>

        <button
          onClick={handleRun}
          disabled={isExecuting || wfNodes.length === 0}
          style={{
            background: isExecuting ? "#4c1d95" : "#7c3aed",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            padding: "7px 16px",
            cursor: isExecuting || wfNodes.length === 0 ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            opacity: wfNodes.length === 0 ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {isExecuting ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  border: "2px solid #ffffff44",
                  borderTop: "2px solid #fff",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Running...
            </>
          ) : (
            "Run"
          )}
        </button>

        <button
          onClick={clearWorkflow}
          disabled={isExecuting}
          style={{
            background: "transparent",
            border: "1px solid #253244",
            borderRadius: 6,
            color: "#94a3b8",
            padding: "7px 14px",
            cursor: isExecuting ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
