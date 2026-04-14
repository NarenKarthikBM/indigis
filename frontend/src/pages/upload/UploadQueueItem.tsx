import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTaskPoller } from "../../hooks/useTaskPoller";
import { useStore } from "../../store";
import type { UploadQueueItem as QueueItem } from "../../store/uploadSlice";
import type { UploadTaskStage } from "../../types/layer.types";

const STAGE_LABELS: Record<UploadTaskStage, string> = {
  queued: "Queued",
  extracting_metadata: "Reading metadata",
  converting_cog: "Converting to COG",
  registering: "Registering",
  done: "Done",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  item: QueueItem;
  onConfigure: (localId: string) => void;
}

export default function UploadQueueItem({ item, onConfigure }: Props) {
  const updateQueueItem = useStore((s) => s.updateQueueItem);
  const removeFromQueue = useStore((s) => s.removeFromQueue);

  const { task } = useTaskPoller(
    item.status === "processing" ? item.taskId : null
  );

  useEffect(() => {
    if (!task) return;
    const patch: Partial<QueueItem> = { task };
    if (task.status === "done") patch.status = "done";
    if (task.status === "failed") {
      patch.status = "failed";
      patch.error = task.error_message || "Processing failed.";
    }
    updateQueueItem(item.localId, patch);
  }, [task, item.localId, updateQueueItem]);

  const fileTypeBadge = item.fileType === "nc" ? "NetCDF" : "TIFF";

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={s.fileInfo}>
          <span style={s.fileName}>{item.file.name}</span>
          <div style={s.badges}>
            <span style={s.badge}>{fileTypeBadge}</span>
            <span style={{ ...s.badge, color: "#8b9db0" }}>{formatBytes(item.file.size)}</span>
          </div>
        </div>
        <button style={s.removeBtn} onClick={() => removeFromQueue(item.localId)} title="Remove">
          ✕
        </button>
      </div>

      {/* State-specific UI */}
      {item.status === "idle" && (
        <div style={s.actionRow}>
          <span style={s.stateText}>Ready to configure</span>
          <button style={s.configBtn} onClick={() => onConfigure(item.localId)}>
            Configure →
          </button>
        </div>
      )}

      {item.status === "inspecting" && (
        <div style={s.stateRow}>
          <div style={s.spinner} />
          <span style={s.stateText}>Inspecting file…</span>
        </div>
      )}

      {item.status === "configuring" && (
        <div style={s.actionRow}>
          <span style={s.stateText}>Configure layer details</span>
          <button style={s.configBtn} onClick={() => onConfigure(item.localId)}>
            Edit →
          </button>
        </div>
      )}

      {item.status === "uploading" && (
        <div style={s.progressSection}>
          <div style={s.progressLabel}>
            <span style={s.stateText}>Uploading…</span>
            <span style={s.progressPct}>{item.httpUploadProgress}%</span>
          </div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressBar, width: `${item.httpUploadProgress}%` }} />
          </div>
        </div>
      )}

      {item.status === "processing" && (
        <div style={s.progressSection}>
          <div style={s.progressLabel}>
            <span style={s.stateText}>
              {STAGE_LABELS[item.task?.stage ?? "queued"]}
            </span>
            <span style={s.progressPct}>{item.task?.progress ?? 0}%</span>
          </div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressBar, width: `${item.task?.progress ?? 0}%` }} />
          </div>
        </div>
      )}

      {item.status === "done" && (
        <div style={s.successRow}>
          <span style={s.successIcon}>✓</span>
          <span style={s.successText}>
            {item.task?.layer?.label ?? "Layer registered"}
          </span>
          {item.task?.layer && (
            <Link to="/" style={s.viewLink}>
              View on map →
            </Link>
          )}
        </div>
      )}

      {item.status === "failed" && (
        <div style={s.errorRow}>
          <span style={s.errorText}>{item.error ?? "Processing failed."}</span>
          <button style={s.retryBtn} onClick={() => onConfigure(item.localId)}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    background: "#1a2535",
    border: "1px solid #253244",
    borderRadius: "10px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  fileInfo: { display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 },
  fileName: {
    color: "#e8edf2",
    fontSize: "14px",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badges: { display: "flex", gap: "8px" },
  badge: {
    background: "#253244",
    color: "#8B5CF6",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: 600,
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#8b9db0",
    cursor: "pointer",
    fontSize: "14px",
    padding: "2px 4px",
    flexShrink: 0,
  },
  stateRow: { display: "flex", alignItems: "center", gap: "10px" },
  actionRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  stateText: { color: "#8b9db0", fontSize: "13px" },
  configBtn: {
    background: "#8B5CF6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "7px 16px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid #3a4d62",
    borderTop: "2px solid #8B5CF6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
  },
  progressSection: { display: "flex", flexDirection: "column", gap: "6px" },
  progressLabel: { display: "flex", justifyContent: "space-between" },
  progressPct: { color: "#8B5CF6", fontSize: "13px", fontWeight: 600 },
  progressTrack: { height: "6px", background: "#253244", borderRadius: "3px", overflow: "hidden" },
  progressBar: { height: "100%", background: "#8B5CF6", transition: "width 0.3s ease" },
  successRow: { display: "flex", alignItems: "center", gap: "10px" },
  successIcon: { color: "#4ade80", fontSize: "18px", fontWeight: 700 },
  successText: { color: "#4ade80", fontSize: "13px", fontWeight: 600, flex: 1 },
  viewLink: { color: "#8B5CF6", fontSize: "13px", textDecoration: "none", fontWeight: 600 },
  errorRow: { display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" },
  errorText: { color: "#f87171", fontSize: "13px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  retryBtn: {
    background: "transparent",
    color: "#f87171",
    border: "1px solid #f87171",
    borderRadius: "6px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
};
