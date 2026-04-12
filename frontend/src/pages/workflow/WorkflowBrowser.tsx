import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { listWorkflows, getWorkflow, deleteWorkflow } from "../../api/workflows";
import type { SavedWorkflow } from "../../types/workflow.types";

interface WorkflowBrowserProps {
  onClose: () => void;
}

export default function WorkflowBrowser({ onClose }: WorkflowBrowserProps) {
  const loadWorkflow = useStore((s) => s.loadWorkflow);
  const clearWorkflow = useStore((s) => s.clearWorkflow);

  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    listWorkflows()
      .then(setWorkflows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleOpen(id: number) {
    try {
      const wf = await getWorkflow(id);
      loadWorkflow(wf);
      onClose();
    } catch {
      alert("Failed to load workflow.");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this workflow?")) return;
    setDeleting(id);
    try {
      await deleteWorkflow(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch {
      alert("Failed to delete workflow.");
    } finally {
      setDeleting(null);
    }
  }

  function handleNew() {
    clearWorkflow();
    onClose();
  }

  function formatTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a2535",
          borderRadius: 10,
          border: "1px solid #253244",
          width: 440,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: "1px solid #253244",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>
            Saved Workflows
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 16px 6px" }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              background: "#0f1724",
              border: "1px solid #253244",
              borderRadius: 6,
              color: "#e2e8f0",
              padding: "7px 10px",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 12px" }}>
          {loading && (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "16px 0", textAlign: "center" }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 13, padding: "16px 0", textAlign: "center" }}>
              {search ? "No matching workflows" : "No saved workflows yet"}
            </div>
          )}
          {filtered.map((wf) => (
            <div
              key={wf.id}
              style={{
                background: "#253244",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
              onClick={() => handleOpen(wf.id)}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                  {wf.name}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  Updated {formatTime(wf.updated_at)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(wf.id);
                }}
                disabled={deleting === wf.id}
                style={{
                  background: "none",
                  border: "1px solid #374151",
                  borderRadius: 4,
                  color: "#ef4444",
                  cursor: deleting === wf.id ? "not-allowed" : "pointer",
                  fontSize: 11,
                  padding: "3px 8px",
                  opacity: deleting === wf.id ? 0.5 : 1,
                }}
              >
                Del
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 16px 12px", borderTop: "1px solid #253244" }}>
          <button
            onClick={handleNew}
            style={{
              width: "100%",
              background: "#0f1724",
              border: "1px solid #253244",
              borderRadius: 6,
              color: "#94a3b8",
              padding: "8px 0",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            + New Workflow
          </button>
        </div>
      </div>
    </div>
  );
}
