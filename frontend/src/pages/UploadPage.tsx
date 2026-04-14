import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { inspectLayer, inspectNetCDF } from "../api/upload";
import type { RasterMetadata } from "../api/upload";
import { useStore } from "../store";
import type { UploadQueueItem } from "../store/uploadSlice";
import type { NCInspectResult } from "../types/layer.types";
import UploadQueueItemCard from "./upload/UploadQueueItem";
import NCVariableSelector from "./upload/NCVariableSelector";
import UploadStep2, { type Step2FormData } from "./upload/UploadStep2";
import UploadStep3 from "./upload/UploadStep3";

// ─── Inline Configure Panel ───────────────────────────────────────────────────

interface ConfigurePanelProps {
  item: UploadQueueItem;
  onDone: () => void;
}

function ConfigurePanel({ item, onDone }: ConfigurePanelProps) {
  const updateQueueItem = useStore((s) => s.updateQueueItem);

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  const defaultForm: Step2FormData = item.formData ?? {
    label: item.file.name.replace(/\.(tif|tiff)$/i, "").replace(/[-_]/g, " "),
    slug: slugify(item.file.name.replace(/\.(tif|tiff)$/i, "")),
    overlay_type: "core",
    categoryInput: "",
    colormap: "viridis",
    description: "",
    date_start:
      item.metadata && "date_start" in item.metadata && "bbox" in item.metadata
        ? (item.metadata as RasterMetadata).date_start ?? ""
        : "",
    date_end:
      item.metadata && "date_end" in item.metadata && "bbox" in item.metadata
        ? (item.metadata as RasterMetadata).date_end ?? ""
        : "",
  };

  const [formData, setFormData] = useState<Step2FormData>(defaultForm);

  if (item.fileType === "tiff" && item.metadata && "bbox" in item.metadata) {
    return (
      <div style={cp.wrapper}>
        <UploadStep2
          metadata={item.metadata as RasterMetadata}
          formData={formData}
          onChange={setFormData}
          onBack={onDone}
          onNext={() => {
            updateQueueItem(item.localId, { formData, status: "configuring" });
            onDone();
          }}
        />
      </div>
    );
  }

  return null;
}

const cp: Record<string, React.CSSProperties> = {
  wrapper: {
    background: "#162032",
    border: "1px solid #253244",
    borderRadius: "8px",
    padding: "16px",
    marginTop: "8px",
  },
};

// ─── Queue Item with inline TIFF upload (step 3) ──────────────────────────────

interface QueueEntryProps {
  item: UploadQueueItem;
}

function QueueEntry({ item }: QueueEntryProps) {
  const updateQueueItem = useStore((s) => s.updateQueueItem);
  const [configuring, setConfiguring] = useState(false);

  function handleConfigure(localId: string) {
    setConfiguring(true);
  }

  if (
    item.status === "configuring" &&
    item.formData &&
    item.fileType === "tiff" &&
    item.metadata &&
    "bbox" in item.metadata
  ) {
    return (
      <div>
        <UploadQueueItemCard item={item} onConfigure={handleConfigure} />
        <div style={qe.step3Wrapper}>
          <UploadStep3
            file={item.file}
            metadata={item.metadata as RasterMetadata}
            formData={item.formData}
            onBack={() => updateQueueItem(item.localId, { status: "idle", formData: null })}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <UploadQueueItemCard item={item} onConfigure={handleConfigure} />
      {configuring && item.fileType === "tiff" && (
        <ConfigurePanel item={item} onDone={() => setConfiguring(false)} />
      )}
    </div>
  );
}

const qe: Record<string, React.CSSProperties> = {
  step3Wrapper: {
    background: "#162032",
    border: "1px solid #253244",
    borderRadius: "8px",
    padding: "16px",
    marginTop: "8px",
  },
};

// ─── NC Variable Selector Overlay ─────────────────────────────────────────────

interface NCOverlayProps {
  item: UploadQueueItem;
  onClose: () => void;
}

function NCOverlay({ item, onClose }: NCOverlayProps) {
  const { addToQueue, removeFromQueue } = useStore((s) => ({
    addToQueue: s.addToQueue,
    removeFromQueue: s.removeFromQueue,
  }));

  const ncResult = item.metadata as NCInspectResult;

  function handleTasksCreated(tasks: Array<{ variable: string; task_id: string }>) {
    removeFromQueue(item.localId);
    tasks.forEach(({ variable, task_id }) => {
      const child: UploadQueueItem = {
        localId: crypto.randomUUID(),
        file: item.file,
        fileType: "nc",
        status: "processing",
        httpUploadProgress: 100,
        taskId: task_id,
        task: null,
        metadata: null,
        selectedVariables: [],
        formData: null,
        error: null,
      };
      addToQueue(child);
    });
    onClose();
  }

  return (
    <div style={nc.overlay}>
      <div style={nc.modal}>
        <div style={nc.header}>
          <span style={nc.title}>{item.file.name}</span>
          <button style={nc.closeBtn} onClick={onClose}>✕</button>
        </div>
        <NCVariableSelector
          tmpNcPath={ncResult.tmp_nc_path}
          variables={ncResult.variables}
          onTasksCreated={handleTasksCreated}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

const nc: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "16px",
  },
  modal: {
    background: "#1a2535",
    borderRadius: "12px",
    border: "1px solid #253244",
    padding: "24px",
    width: "100%",
    maxWidth: "600px",
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#e8edf2", fontSize: "15px", fontWeight: 700 },
  closeBtn: { background: "none", border: "none", color: "#8b9db0", cursor: "pointer", fontSize: "16px" },
};

// ─── Upload Page ──────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { uploadQueue, addToQueue, clearCompleted } = useStore((s) => ({
    uploadQueue: s.uploadQueue,
    addToQueue: s.addToQueue,
    clearCompleted: s.clearCompleted,
  }));
  const updateQueueItem = useStore((s) => s.updateQueueItem);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [ncOverlayItem, setNcOverlayItem] = useState<UploadQueueItem | null>(null);

  async function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "tif" && ext !== "tiff" && ext !== "nc") continue;

      const localId = crypto.randomUUID();
      const fileType: "tiff" | "nc" = ext === "nc" ? "nc" : "tiff";

      const item: UploadQueueItem = {
        localId,
        file,
        fileType,
        status: "inspecting",
        httpUploadProgress: 0,
        taskId: null,
        task: null,
        metadata: null,
        selectedVariables: [],
        formData: null,
        error: null,
      };
      addToQueue(item);

      try {
        if (fileType === "nc") {
          const result = await inspectNetCDF(file);
          updateQueueItem(localId, { status: "idle", metadata: result });
          // Open NC selector immediately
          const updatedItem: UploadQueueItem = { ...item, status: "idle", metadata: result };
          setNcOverlayItem(updatedItem);
        } else {
          const meta = await inspectLayer(file);
          updateQueueItem(localId, { status: "idle", metadata: meta });
        }
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        updateQueueItem(localId, {
          status: "failed",
          error: msg ?? "Could not inspect file.",
        });
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = "";
  }

  const completedCount = uploadQueue.filter(
    (i) => i.status === "done" || i.status === "failed"
  ).length;

  return (
    <div style={ps.page}>
      <div style={ps.card}>
        <div style={ps.header}>
          <Link to="/" style={ps.back}>← Map</Link>
          <h1 style={ps.title}>Upload Layers</h1>
          {completedCount > 0 && (
            <button style={ps.clearBtn} onClick={clearCompleted}>
              Clear completed ({completedCount})
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div
          style={{ ...ps.dropZone, ...(dragging ? ps.dropZoneActive : {}) }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".tif,.tiff,.nc"
            multiple
            style={{ display: "none" }}
            onChange={handleInputChange}
          />
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p style={ps.dropText}>
            {dragging ? "Release to add files" : "Drag & drop files here or click to browse"}
          </p>
          <p style={ps.hint}>Accepts multiple .tif, .tiff, and .nc files</p>
        </div>

        {/* Queue */}
        {uploadQueue.length > 0 && (
          <div style={ps.queue}>
            {uploadQueue.map((item) => (
              <QueueEntry key={item.localId} item={item} />
            ))}
          </div>
        )}

        {uploadQueue.length === 0 && (
          <p style={ps.emptyHint}>Files you add will appear here.</p>
        )}
      </div>

      {/* NC variable selector modal */}
      {ncOverlayItem && (
        <NCOverlay
          item={ncOverlayItem}
          onClose={() => setNcOverlayItem(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const ps: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0f1724",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "40px 16px",
  },
  card: {
    width: "100%",
    maxWidth: "760px",
    background: "#1a2535",
    borderRadius: "12px",
    padding: "32px",
    border: "1px solid #253244",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "4px",
  },
  back: { color: "#8b9db0", textDecoration: "none", fontSize: "14px" },
  title: { color: "#e8edf2", fontSize: "20px", fontWeight: 700, margin: 0, flex: 1 },
  clearBtn: {
    background: "transparent",
    color: "#8b9db0",
    border: "1px solid #3a4d62",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  dropZone: {
    border: "2px dashed #3a4d62",
    borderRadius: "12px",
    padding: "32px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
    background: "#162032",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  dropZoneActive: {
    borderColor: "#8B5CF6",
    background: "#1e1a35",
  },
  dropText: { color: "#e8edf2", fontSize: "15px", fontWeight: 600, margin: 0 },
  hint: { color: "#8b9db0", fontSize: "12px", margin: 0 },
  queue: { display: "flex", flexDirection: "column", gap: "12px" },
  emptyHint: { color: "#8b9db0", fontSize: "13px", textAlign: "center", margin: 0 },
};
