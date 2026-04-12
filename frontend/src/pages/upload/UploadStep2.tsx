import { useEffect, useState } from "react";
import { fetchCategories } from "../../api/layers";
import type { RasterMetadata } from "../../api/upload";
import type { LayerCategory } from "../../types/layer.types";

const COLORMAPS = ["viridis", "plasma", "inferno", "magma", "terrain", "RdYlGn", "RdBu", "gray"];

export interface Step2FormData {
  label: string;
  slug: string;
  overlay_type: "core" | "community";
  categoryInput: string;
  colormap: string;
  description: string;
  date_start: string;
  date_end: string;
}

interface Props {
  metadata: RasterMetadata;
  formData: Step2FormData;
  onChange: (data: Step2FormData) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function UploadStep2({ metadata, formData, onChange, onBack, onNext }: Props) {
  const [categories, setCategories] = useState<LayerCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(console.error);
  }, []);

  const filteredCategories = categories.filter((c) => c.overlay_type === formData.overlay_type);

  function set(field: keyof Step2FormData, value: string) {
    onChange({ ...formData, [field]: value });
  }

  function handleLabelBlur() {
    if (!slugEdited) {
      set("slug", slugify(formData.label));
    }
  }

  function handleNext() {
    if (!formData.label.trim()) return setError("Label is required.");
    if (!/^[a-z0-9-]+$/.test(formData.slug)) return setError("Slug must only contain lowercase letters, numbers, and hyphens.");
    if (!formData.categoryInput.trim()) return setError("Category is required.");
    setError(null);
    onNext();
  }

  const bbox = metadata.bbox;

  return (
    <div style={s.container}>
      {/* Read-only metadata chips */}
      <div style={s.chipsRow}>
        <Chip label="CRS" value={metadata.native_crs || "Unknown"} />
        <Chip label="Bands" value={String(metadata.band_count ?? "?")} />
        {metadata.spatial_resolution_m != null && (
          <Chip label="Resolution" value={`${metadata.spatial_resolution_m.toFixed(1)} m`} />
        )}
        {bbox && (
          <Chip
            label="BBox"
            value={`${bbox.minx.toFixed(2)}, ${bbox.miny.toFixed(2)}, ${bbox.maxx.toFixed(2)}, ${bbox.maxy.toFixed(2)}`}
          />
        )}
      </div>

      <div style={s.form}>
        <label style={s.label}>Label</label>
        <input
          style={s.input}
          value={formData.label}
          onChange={(e) => set("label", e.target.value)}
          onBlur={handleLabelBlur}
          placeholder="e.g. SRTM 30m"
          required
        />

        <label style={s.label}>Slug</label>
        <input
          style={s.input}
          value={formData.slug}
          onChange={(e) => {
            setSlugEdited(true);
            set("slug", e.target.value);
          }}
          pattern="[a-z0-9-]+"
          placeholder="e.g. srtm-30m"
          required
        />

        <label style={s.label}>Overlay Type</label>
        <select
          style={s.select}
          value={formData.overlay_type}
          onChange={(e) => {
            onChange({ ...formData, overlay_type: e.target.value as "core" | "community", categoryInput: "" });
          }}
        >
          <option value="core">Core</option>
          <option value="community">Community</option>
        </select>

        <label style={s.label}>Category</label>
        <input
          style={s.input}
          list="category-options-step2"
          value={formData.categoryInput}
          onChange={(e) => set("categoryInput", e.target.value)}
          placeholder="Select or type new category…"
          required
        />
        <datalist id="category-options-step2">
          {filteredCategories.map((c) => (
            <option key={c.slug} value={c.name} />
          ))}
        </datalist>

        <label style={s.label}>Colormap</label>
        <select style={s.select} value={formData.colormap} onChange={(e) => set("colormap", e.target.value)}>
          {COLORMAPS.map((cm) => (
            <option key={cm} value={cm}>{cm}</option>
          ))}
        </select>

        <label style={s.label}>Description (optional)</label>
        <textarea
          style={{ ...s.input, resize: "vertical", minHeight: "72px" }}
          value={formData.description}
          onChange={(e) => set("description", e.target.value)}
        />

        <label style={s.label}>Date Start (optional)</label>
        <input
          type="date"
          style={s.input}
          value={formData.date_start}
          onChange={(e) => set("date_start", e.target.value)}
        />

        <label style={s.label}>Date End (optional)</label>
        <input
          type="date"
          style={s.input}
          value={formData.date_end}
          onChange={(e) => set("date_end", e.target.value)}
        />
      </div>

      {error && <p style={s.error}>{error}</p>}

      <div style={s.buttonRow}>
        <button style={s.backBtn} onClick={onBack}>Back</button>
        <button style={s.nextBtn} onClick={handleNext}>Next →</button>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={chipStyle}>
      <span style={chipLabel}>{label}:</span> {value}
    </span>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: "14px" },
  chipsRow: { display: "flex", flexWrap: "wrap", gap: "8px" },
  form: { display: "flex", flexDirection: "column", gap: "10px" },
  label: { color: "#8b9db0", fontSize: "13px" },
  input: {
    background: "#212d3f",
    border: "1px solid #3a4d62",
    borderRadius: "6px",
    color: "#e8edf2",
    padding: "10px 12px",
    fontSize: "14px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    background: "#212d3f",
    border: "1px solid #3a4d62",
    borderRadius: "6px",
    color: "#e8edf2",
    padding: "10px 12px",
    fontSize: "14px",
    outline: "none",
    width: "100%",
  },
  error: { color: "#f87171", fontSize: "13px", margin: 0 },
  buttonRow: { display: "flex", justifyContent: "space-between", marginTop: "4px" },
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
  nextBtn: {
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

const chipStyle: React.CSSProperties = {
  background: "#1e2d3d",
  border: "1px solid #3a4d62",
  borderRadius: "20px",
  padding: "4px 12px",
  fontSize: "12px",
  color: "#8b9db0",
  whiteSpace: "nowrap",
};
const chipLabel: React.CSSProperties = { color: "#8B5CF6", fontWeight: 600 };
