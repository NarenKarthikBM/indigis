import { Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import PrivateRoute from "./components/auth/PrivateRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UploadPage from "./pages/UploadPage";
import WorkflowBuilderPage from "./pages/WorkflowBuilderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<AppShell />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/workflows" element={<WorkflowBuilderPage />} />
      </Route>
    </Routes>
  );
}
