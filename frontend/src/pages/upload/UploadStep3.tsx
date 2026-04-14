import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Rectangle } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchCategories } from "../../api/layers";
import { uploadLayerAsync } from "../../api/upload";
import { useTaskPoller } from "../../hooks/useTaskPoller";
import type { RasterMetadata } from "../../api/upload";
import type { Layer, LayerCategory } from "../../types/layer.types";
import type { Step2FormData } from "./UploadStep2";

interface Props {
  file: File;
  metadata: RasterMetadata;
  formData: Step2FormData;
  onBack: () => void;
}

export default function UploadStep3({ file, metadata, formData, onBack }: Props) {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [httpProgress, setHttpProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { task } = useTaskPoller(taskId);

  const uploadedLayer: Layer | null = task?.layer ?? null;

  const bbox = metadata.bbox;
  const bounds: LatLngBoundsExpression | null = bbox
    ? [
        [bbox.miny, bbox.minx],
        [bbox.maxy, bbox.maxx],
      ]
    : null;
  const center: [number, number] = bbox
    ? [(bbox.miny + bbox.maxy) / 2, (bbox.minx + bbox.maxx) / 2]
    : [0, 0];

  async function handleUpload() {
    setError(null);
    setUploading(true);
    setHttpProgress(0);

    const categories: LayerCategory[] = await fetchCategories().catch(() => []);
    const filteredCategories = categories.filter((c) => c.overlay_type === formData.overlay_type);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("label", formData.label.trim());
    fd.append("overlay_type", formData.overlay_type);
    fd.append("colormap_name", formData.colormap);
    if (formData.description) fd.append("description", formData.description);
    if (formData.date_start) fd.append("date_start", formData.date_start);
    if (formData.date_end) fd.append("date_end", formData.date_end);

    const existingBySlug = filteredCategories.find((c) => c.slug === formData.categoryInput);
    const existingByName = filteredCategories.find(
      (c) => c.name.toLowerCase() === formData.categoryInput.toLowerCase()
    );
    if (existingBySlug) {
      fd.append("category_slug", existingBySlug.slug);
    } else if (existingByName) {
      fd.append("category_slug", existingByName.slug);
    } else {
      fd.append("category_name", formData.categoryInput.trim());
    }

    try {
      const { task_id } = await uploadLayerAsync(fd, setHttpProgress);
      setTaskId(task_id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const titilerBase = import.meta.env.VITE_TITILER_URL ?? "";
  const cogUrl = uploadedLayer?.raster_assets?.[0]?.cog_url;
  const tileUrl =
    uploadedLayer && cogUrl
      ? `${titilerBase}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${encodeURIComponent(cogUrl)}&colormap_name=${formData.colormap}`
      : null;

  return (
    <div style={s.container}>
      {/* Summary card */}
      <div style={s.summary}>
        <SummaryRow label="Label" value={formData.label} />
        <SummaryRow label="Category" value={formData.categoryInput} />
        <SummaryRow label="Colormap" value={formData.colormap} />
        <SummaryRow label="CRS" value={metadata.native_crs || "Unknown"} />
        {metadata.band_count != null && <SummaryRow label="Bands" value={String(metadata.band_count)} />}
        {metadata.spatial_resolution_m != null && (
          <SummaryRow label="Resolution" value={`${metadata.spatial_resolution_m.toFixed(1)} m`} />
        )}
        {bbox && (
          <SummaryRow
            label="BBox"
            value={`${bbox.minx.toFixed(2)}, ${bbox.miny.toFixed(2)}, ${bbox.maxx.toFixed(2)}, ${bbox.maxy.toFixed(2)}`}
          />
        )}
      </div>

      {/* Leaflet mini-map */}
      {bounds && (
        <div style={s.mapWrapper}>
          <MapContainer
            center={center}
            zoom={6}
            style={{ height: "300px", width: "100%", borderRadius: "8px" }}
            zoomControl={false}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; CartoDB"
            />
            {tileUrl ? (
              <TileLayer url={tileUrl} opacity={0.85} />
            ) : (
              <Rectangle
                bounds={bounds}
                pathOptions={{ color: "#8B5CF6", fillColor: "#8B5CF6", fillOpacity: 0.2, weight: 2 }}
              />
            )}
          </MapContainer>
        </div>
      )}

      {/* HTTP upload progress */}
      {uploading && (
        <div style={s.progressSection}>
          <div style={s.progressLabel}>
            <span style={s.progressText}>Uploading…</span>
            <span style={s.progressPct}>{httpProgress}%</span>
          </div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressBar, width: `${httpProgress}%` }} />
          </div>
        </div>
      )}

      {/* Worker processing progress */}
      {taskId && !uploading && task && task.status !== "done" && task.status !== "failed" && (
        <div style={s.progressSection}>
          <div style={s.progressLabel}>
            <span style={s.progressText}>
              {task.stage === "extracting_metadata" && "Reading metadata…"}
              {task.stage === "converting_cog" && "Converting to COG…"}
              {task.stage === "registering" && "Registering layer…"}
              {(task.stage === "queued" || !task.stage) && "Queued…"}
            </span>
            <span style={s.progressPct}>{task.progress}%</span>
          </div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressBar, width: `${task.progress}%` }} />
          </div>
        </div>
      )}

      {task?.status === "failed" && !error && (
        <p style={s.error}>{task.error_message || "Processing failed."}</p>
      )}

      {error && <p style={s.error}>{error}</p>}

      {uploadedLayer ? (
        <div style={s.successRow}>
          <span style={s.successText}>Layer registered successfully!</span>
          <button style={s.doneBtn} onClick={() => navigate("/")}>
            Done →
          </button>
        </div>
      ) : !taskId ? (
        <div style={s.buttonRow}>
          <button style={s.backBtn} onClick={onBack} disabled={uploading}>
            Back
          </button>
          <button style={s.uploadBtn} onClick={handleUpload} disabled={uploading}>
            {uploading ? `Uploading… ${httpProgress}%` : "Upload Layer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={sr.row}>
      <span style={sr.label}>{label}</span>
      <span style={sr.value}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: "16px" },
  summary: {
    background: "#162032",
    border: "1px solid #253244",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  mapWrapper: { borderRadius: "8px", overflow: "hidden" },
  progressSection: { display: "flex", flexDirection: "column", gap: "6px" },
  progressLabel: { display: "flex", justifyContent: "space-between" },
  progressText: { color: "#8b9db0", fontSize: "13px" },
  progressPct: { color: "#8B5CF6", fontSize: "13px", fontWeight: 600 },
  progressTrack: { height: "6px", background: "#253244", borderRadius: "3px", overflow: "hidden" },
  progressBar: { height: "100%", background: "#8B5CF6", transition: "width 0.2s" },
  error: { color: "#f87171", fontSize: "13px", margin: 0 },
  buttonRow: { display: "flex", justifyContent: "space-between" },
  backBtn: {
    padding: "10px 20px",
    background: "transparent",
    color: "#8b9db0",
    border: "1px solid #3a4d62",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  },
  uploadBtn: {
    padding: "11px 28px",
    background: "#8B5CF6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "15px",
    cursor: "pointer",
  },
  successRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  successText: { color: "#4ade80", fontSize: "14px", fontWeight: 600 },
  doneBtn: {
    padding: "10px 24px",
    background: "#8B5CF6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  },
};

const sr: Record<string, React.CSSProperties> = {
  row: { display: "flex", justifyContent: "space-between", gap: "12px" },
  label: { color: "#8b9db0", fontSize: "13px", flexShrink: 0 },
  value: { color: "#e8edf2", fontSize: "13px", textAlign: "right", wordBreak: "break-all" },
};
