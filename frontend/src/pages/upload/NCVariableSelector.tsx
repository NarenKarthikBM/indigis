import { useState } from "react";
import { uploadNetCDF } from "../../api/upload";
import type { NCVariable } from "../../types/layer.types";

interface Props {
  tmpNcPath: string;
  variables: NCVariable[];
  onTasksCreated: (tasks: Array<{ variable: string; task_id: string }>) => void;
  onCancel: () => void;
}

export default function NCVariableSelector({ tmpNcPath, variables, onTasksCreated, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(variables.map((v) => v.name)));
  const [labelPrefix, setLabelPrefix] = useState("");
  const [overlayType, setOverlayType] = useState<"core" | "community">("community");
  const [categoryInput, setCategoryInput] = useState("");
  const [colormap, setColormap] = useState("viridis");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === variables.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(variables.map((v) => v.name)));
    }
  }

  function toggleVar(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleUpload() {
    if (selected.size === 0) {
      setError("Select at least one variable.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const metadata: Record<string, string> = {
        label_prefix: labelPrefix,
        overlay_type: overlayType,
        colormap_name: colormap,
      };
      if (categoryInput.trim()) {
        metadata.category_name = categoryInput.trim();
      }

      const result = await uploadNetCDF({
        tmp_nc_path: tmpNcPath,
        variables: Array.from(selected),
        metadata,
      });
      onTasksCreated(result.tasks);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={s.container}>
      <p style={s.heading}>Select variables to import</p>

      <div style={s.varList}>
        <label style={s.varRow}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span style={s.selectAllLabel}>Select all ({variables.length})</span>
        </label>
        <div style={s.divider} />
        {variables.map((v) => (
          <label key={v.name} style={s.varRow}>
            <input
              type="checkbox"
              checked={selected.has(v.name)}
              onChange={() => toggleVar(v.name)}
            />
            <div style={s.varInfo}>
              <span style={s.varName}>{v.name}</span>
              {v.long_name && <span style={s.varMeta}>{v.long_name}</span>}
              <span style={s.varMeta}>
                {v.units ? `${v.units} · ` : ""}
                {v.dimensions.join(", ")} [{v.shape.join(" × ")}]
              </span>
            </div>
          </label>
        ))}
      </div>

      <div style={s.formGrid}>
        <div style={s.field}>
          <label style={s.label}>Label prefix (optional)</label>
          <input
            style={s.input}
            value={labelPrefix}
            onChange={(e) => setLabelPrefix(e.target.value)}
            placeholder="e.g. ERA5"
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Overlay type</label>
          <select style={s.input} value={overlayType} onChange={(e) => setOverlayType(e.target.value as "core" | "community")}>
            <option value="core">Core</option>
            <option value="community">Community</option>
          </select>
        </div>
        <div style={s.field}>
          <label style={s.label}>Category name</label>
          <input
            style={s.input}
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            placeholder="e.g. Climate"
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Colormap</label>
          <select style={s.input} value={colormap} onChange={(e) => setColormap(e.target.value)}>
            {["viridis", "plasma", "inferno", "magma", "terrain", "RdYlGn", "RdBu", "gray"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p style={s.error}>{error}</p>}

      <div style={s.btnRow}>
        <button style={s.cancelBtn} onClick={onCancel} disabled={uploading}>
          Cancel
        </button>
        <button style={s.uploadBtn} onClick={handleUpload} disabled={uploading || selected.size === 0}>
          {uploading ? "Starting…" : `Start Upload (${selected.size} variable${selected.size !== 1 ? "s" : ""})`}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: "16px" },
  heading: { color: "#e8edf2", fontSize: "14px", fontWeight: 600, margin: 0 },
  varList: {
    background: "#162032",
    border: "1px solid #253244",
    borderRadius: "8px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "240px",
    overflowY: "auto",
  },
  varRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    cursor: "pointer",
  },
  selectAllLabel: { color: "#e8edf2", fontSize: "13px", fontWeight: 600 },
  divider: { height: "1px", background: "#253244", margin: "2px 0" },
  varInfo: { display: "flex", flexDirection: "column", gap: "2px" },
  varName: { color: "#e8edf2", fontSize: "13px", fontWeight: 600 },
  varMeta: { color: "#8b9db0", fontSize: "12px" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  label: { color: "#8b9db0", fontSize: "12px" },
  input: {
    background: "#162032",
    border: "1px solid #3a4d62",
    borderRadius: "6px",
    padding: "8px 10px",
    color: "#e8edf2",
    fontSize: "13px",
    outline: "none",
  },
  error: { color: "#f87171", fontSize: "13px", margin: 0 },
  btnRow: { display: "flex", justifyContent: "flex-end", gap: "10px" },
  cancelBtn: {
    background: "transparent",
    color: "#8b9db0",
    border: "1px solid #3a4d62",
    borderRadius: "6px",
    padding: "9px 20px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  uploadBtn: {
    background: "#8B5CF6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "9px 20px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
};
