import type React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../../store";
import type { NavSection } from "../../store/uiSlice";

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
}

const CoreOverlaysIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const CommunityOverlaysIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="3" />
    <circle cx="15" cy="7" r="3" />
    <path d="M3 21v-2a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v2" />
  </svg>
);

const ActiveLayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <polyline points="9 11 12 14 22 4" />
  </svg>
);

const AboutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const WorkflowsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="6" height="5" rx="1" />
    <rect x="16" y="3" width="6" height="5" rx="1" />
    <rect x="9" y="16" width="6" height="5" rx="1" />
    <path d="M5 8v3c0 1.1.9 2 2 2h10a2 2 0 0 0 2-2V8" />
    <line x1="12" y1="13" x2="12" y2="16" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { id: "active-layers", label: "Active", icon: <ActiveLayersIcon /> },
  { id: "core-overlays", label: "Core", icon: <CoreOverlaysIcon /> },
  { id: "community-overlays", label: "Community", icon: <CommunityOverlaysIcon /> },
  { id: "about", label: "About", icon: <AboutIcon /> },
];

function NavButton({
  isActive,
  onClick,
  title,
  icon,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: "80%",
        padding: "0.5em 0",
        borderRadius: "10px",
        background: isActive ? "#1D2B3E" : "transparent",
        border: isActive ? "1px solid #8B5CF6" : "1px solid transparent",
        color: isActive ? "#8B5CF6" : "#5A6A7A",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.25em",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = "#1a2535";
          (e.currentTarget as HTMLButtonElement).style.color = "#8b9db0";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "#5A6A7A";
        }
      }}
    >
      {icon}
      <span style={{ fontSize: "8px", letterSpacing: "0.04em", fontWeight: 500, lineHeight: 1, color: "inherit" }}>
        {label}
      </span>
    </button>
  );
}

export default function NavRail() {
  const { activeNavSection, setActiveNavSection } = useStore((s) => ({
    activeNavSection: s.activeNavSection,
    setActiveNavSection: s.setActiveNavSection,
  }));
  const navigate = useNavigate();
  const location = useLocation();
  const isWorkflowPage = location.pathname.startsWith("/workflows");

  const handleSectionClick = (id: NavSection) => {
    if (isWorkflowPage) navigate("/");
    setActiveNavSection(activeNavSection === id ? null : id);
  };

  return (
    <nav
      style={{
        width: "72px",
        height: "100%",
        background: "#0a0f16",
        borderRight: "1px solid #253244",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "8px",
        gap: "0.5em",
      }}
    >
      {NAV_ITEMS.map((item) => (
        <NavButton
          key={item.id}
          isActive={!isWorkflowPage && activeNavSection === item.id}
          onClick={() => handleSectionClick(item.id)}
          title={item.label}
          icon={item.icon}
          label={item.label}
        />
      ))}

      <div style={{ width: "60%", height: "1px", background: "#253244", margin: "4px 0" }} />

      <NavButton
        isActive={isWorkflowPage}
        onClick={() => navigate("/workflows")}
        title="Workflow Builder"
        icon={<WorkflowsIcon />}
        label="Workflows"
      />
    </nav>
  );
}
