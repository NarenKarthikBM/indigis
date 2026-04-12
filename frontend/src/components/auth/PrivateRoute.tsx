import { Navigate, Outlet } from "react-router-dom";
import { useStore } from "../../store";

export default function PrivateRoute() {
  const token = useStore((s) => s.token);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
