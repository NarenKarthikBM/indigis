import { useRef, useState } from "react";
import { inspectLayer, inspectNetCDF } from "../../api/upload";
import type { RasterMetadata } from "../../api/upload";
import type { NCInspectResult } from "../../types/layer.types";

interface Props {
  onComplete: (file: File, metadata: RasterMetadata) => void;
  onNcComplete?: (file: File, result: NCInspectResult) => void;
}

export default function UploadStep1({ onComplete, onNcComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext === "nc") {
      setError(null);
      setLoading(true);
      try {
        const result = await inspectNetCDF(f);
        onNcComplete?.(f, result);
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg ?? "Could not inspect NetCDF file.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (ext !== "tif" && ext !== "tiff") {
      setError("Please select a .tif, .tiff, or .nc file.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const meta = await inspectLayer(f);
      onComplete(f, meta);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Could not read file metadata.");
    } finally {
      setLoading(false);
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
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }

  return (
    <div style={s.container}>
      <div
        style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}) }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".tif,.tiff,.nc"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
        {loading ? (
          <div style={s.loadingBox}>
            <div style={s.spinner} />
            <p style={s.loadingText}>Reading file…</p>
          </div>
        ) : (
          <>
            <div style={s.uploadIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p style={s.dropText}>
              {dragging ? "Release to upload" : "Drag & drop your .tif file here"}
            </p>
            <p style={s.orText}>or</p>
            <span style={s.browseBtn}>Browse files</span>
            <p style={s.hint}>Accepts .tif, .tiff raster files and .nc NetCDF files</p>
          </>
        )}
      </div>
      {error && <p style={s.error}>{error}</p>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: "12px" },
  dropZone: {
    border: "2px dashed #3a4d62",
    borderRadius: "12px",
    padding: "48px 24px",
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
  uploadIcon: { marginBottom: "8px" },
  dropText: { color: "#e8edf2", fontSize: "16px", fontWeight: 600, margin: 0 },
  orText: { color: "#8b9db0", fontSize: "13px", margin: "2px 0" },
  browseBtn: {
    color: "#8B5CF6",
    fontWeight: 600,
    fontSize: "14px",
    textDecoration: "underline",
    cursor: "pointer",
  },
  hint: { color: "#8b9db0", fontSize: "12px", margin: "4px 0 0" },
  loadingBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #3a4d62",
    borderTop: "3px solid #8B5CF6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: { color: "#8b9db0", fontSize: "14px", margin: 0 },
  error: { color: "#f87171", fontSize: "13px", margin: 0 },
};
