import { useState } from "react";
import { Link } from "react-router-dom";
import type { RasterMetadata } from "../api/upload";
import UploadStep1 from "./upload/UploadStep1";
import UploadStep2, { type Step2FormData } from "./upload/UploadStep2";
import UploadStep3 from "./upload/UploadStep3";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Wizard Stepper ──────────────────────────────────────────────────────────

const STEPS = ["Upload", "Details", "Preview"];

function WizardStepper({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div style={ss.stepper}>
      {STEPS.flatMap((label, i) => {
        const stepNum = (i + 1) as 1 | 2 | 3;
        const isCompleted = currentStep > stepNum;
        const isActive = currentStep === stepNum;
        const items = [];

        if (i > 0) {
          items.push(
            <div
              key={`line-${i}`}
              style={{
                ...ss.line,
                background: currentStep >= stepNum ? "#8B5CF6" : "#3a4d62",
              }}
            />
          );
        }

        items.push(
          <div key={label} style={ss.stepItem}>
            <div
              style={{
                ...ss.circle,
                background: isActive ? "#8B5CF6" : isCompleted ? "#6D28D9" : "#1e2d3d",
                border: isActive || isCompleted ? "2px solid #8B5CF6" : "2px solid #3a4d62",
              }}
            >
              {isCompleted ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <span style={{ color: isActive ? "#fff" : "#8b9db0", fontSize: "13px", fontWeight: 700 }}>
                  {stepNum}
                </span>
              )}
            </div>
            <span
              style={{
                ...ss.stepLabel,
                color: isActive ? "#e8edf2" : isCompleted ? "#8B5CF6" : "#8b9db0",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        );

        return items;
      })}
    </div>
  );
}

// ─── Upload Page ─────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<RasterMetadata | null>(null);
  const [formData, setFormData] = useState<Step2FormData>({
    label: "",
    slug: "",
    overlay_type: "core",
    categoryInput: "",
    colormap: "viridis",
    description: "",
    date_start: "",
    date_end: "",
  });

  function handleStep1Complete(f: File, meta: RasterMetadata) {
    setFile(f);
    setMetadata(meta);
    // Pre-fill form from file name and metadata
    const derivedLabel = f.name.replace(/\.(tif|tiff)$/i, "").replace(/[-_]/g, " ");
    setFormData((prev) => ({
      ...prev,
      label: prev.label || derivedLabel,
      slug: prev.slug || slugify(derivedLabel),
      date_start: meta.date_start ?? prev.date_start,
      date_end: meta.date_end ?? prev.date_end,
    }));
    setStep(2);
  }

  return (
    <div style={ps.page}>
      <div style={ps.card}>
        <div style={ps.header}>
          <Link to="/" style={ps.back}>← Map</Link>
          <h1 style={ps.title}>Upload Raster Layer</h1>
        </div>

        <WizardStepper currentStep={step} />

        <div style={ps.stepBody}>
          {step === 1 && <UploadStep1 onComplete={handleStep1Complete} />}

          {step === 2 && metadata && (
            <UploadStep2
              metadata={metadata}
              formData={formData}
              onChange={setFormData}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && file && metadata && (
            <UploadStep3
              file={file}
              metadata={metadata}
              formData={formData}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </div>

      {/* Spinner keyframe */}
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
    maxWidth: "680px",
    background: "#1a2535",
    borderRadius: "12px",
    padding: "32px",
    border: "1px solid #253244",
  },
  header: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" },
  back: { color: "#8b9db0", textDecoration: "none", fontSize: "14px" },
  title: { color: "#e8edf2", fontSize: "20px", fontWeight: 700, margin: 0 },
  stepBody: { marginTop: "24px" },
};

const ss: Record<string, React.CSSProperties> = {
  stepper: {
    display: "flex",
    alignItems: "center",
    marginBottom: "8px",
    padding: "16px 0",
    borderBottom: "1px solid #253244",
  },
  stepItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    minWidth: "64px",
  },
  circle: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    height: "2px",
    flex: 1,
    minWidth: "24px",
  },
  stepLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
};
