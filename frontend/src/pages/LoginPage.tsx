import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useStore } from "../store";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(username, password);
      setAuth({
        token: result.access,
        refreshToken: result.refresh,
        username: result.username,
        role: result.role ?? "editor",
      });
      navigate("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={{ color: "#60A5FA" }}>Indi</span>
          <span style={{ color: "#8B5CF6" }}>GIS</span>
        </div>
        <h2 style={styles.title}>Sign in</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <label style={styles.label}>Password</label>
          <input
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={styles.footer}>
          No account?{" "}
          <Link to="/register" style={styles.link}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f1724",
  },
  card: {
    width: "360px",
    background: "#1a2535",
    borderRadius: "12px",
    padding: "40px 32px",
    border: "1px solid #253244",
  },
  logo: {
    fontSize: "28px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textAlign: "center",
    marginBottom: "24px",
  },
  title: {
    color: "#e8edf2",
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "20px",
    textAlign: "center",
  },
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
  },
  error: { color: "#f87171", fontSize: "13px", margin: 0 },
  button: {
    marginTop: "8px",
    padding: "11px",
    background: "#8B5CF6",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "15px",
    cursor: "pointer",
  },
  footer: { color: "#5a6a7a", fontSize: "13px", textAlign: "center", marginTop: "18px" },
  link: { color: "#8B5CF6", textDecoration: "none" },
};
