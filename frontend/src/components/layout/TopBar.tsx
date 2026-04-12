import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../../store";
import SearchBox from "./SearchBox";

export default function TopBar() {
  const { sidebarOpen, setSidebarOpen } = useStore((s) => ({
    sidebarOpen: s.sidebarOpen,
    setSidebarOpen: s.setSidebarOpen,
  }));
  const username = useStore((s) => s.username);
  const clearAuth = useStore((s) => s.clearAuth);
  const navigate = useNavigate();

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <header
      style={{
        height: "72px",
        background: "#151d2b",
        borderBottom: "1px solid #253244",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "12px",
        zIndex: 1000,
      }}
    >
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          background: "none",
          border: "none",
          color: "#8b9db0",
          cursor: "pointer",
          padding: "6px",
          display: "flex",
          alignItems: "center",
          borderRadius: "6px",
          transition: "color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "#e8edf2";
          (e.currentTarget as HTMLButtonElement).style.background = "#1a2535";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "#8b9db0";
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
        title="Toggle panel"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="currentColor">
          <rect y="2" width="18" height="2" rx="1" />
          <rect y="8" width="18" height="2" rx="1" />
          <rect y="14" width="18" height="2" rx="1" />
        </svg>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0 12px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        <span
          style={{
            fontWeight: 700,
            fontSize: "20px",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#60A5FA" }}>Indi</span>
          <span style={{ color: "#8B5CF6" }}>GIS</span>
        </span>
      </div>

      <div style={{ flex: 1, maxWidth: "480px" }}>
        <SearchBox />
      </div>

      {/* Right side: upload link + user chip + logout */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
        <Link
          to="/upload"
          style={{
            color: "#8B5CF6",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            padding: "6px 12px",
            border: "1px solid #8B5CF6",
            borderRadius: "6px",
          }}
        >
          Upload
        </Link>
        {username && (
          <span
            style={{
              color: "#e8edf2",
              fontSize: "13px",
              background: "#212d3f",
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid #3a4d62",
            }}
          >
            {username}
          </span>
        )}
        <button
          onClick={handleLogout}
          style={{
            background: "none",
            border: "1px solid #3a4d62",
            color: "#8b9db0",
            cursor: "pointer",
            padding: "5px 10px",
            borderRadius: "6px",
            fontSize: "13px",
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
