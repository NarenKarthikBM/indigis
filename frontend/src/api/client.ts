import axios from "axios";

const client = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Inject access token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("indigis_access");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → attempt refresh once → clear auth + redirect
let _refreshing = false;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !_refreshing) {
      original._retry = true;
      _refreshing = true;
      const refresh = localStorage.getItem("indigis_refresh");
      if (refresh) {
        try {
          const res = await axios.post("/api/v1/auth/refresh/", { refresh });
          const newAccess: string = res.data.access;
          localStorage.setItem("indigis_access", newAccess);
          original.headers.Authorization = `Bearer ${newAccess}`;
          _refreshing = false;
          return client(original);
        } catch {
          // refresh failed — clear and redirect
        }
      }
      _refreshing = false;
      localStorage.removeItem("indigis_access");
      localStorage.removeItem("indigis_refresh");
      localStorage.removeItem("indigis_username");
      localStorage.removeItem("indigis_role");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default client;
