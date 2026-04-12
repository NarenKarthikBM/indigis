import client from "./client";
import type { AuthTokens, RegisterResponse, UserMe } from "../types/auth.types";

export async function login(username: string, password: string): Promise<AuthTokens & { username: string; role?: string }> {
  const res = await client.post("/auth/login/", { username, password });
  // simplejwt returns {access, refresh}; fetch /me for role
  const tokens = res.data as AuthTokens;
  const me = await fetchMe(tokens.access);
  return { ...tokens, username: me.username, role: me.role };
}

export async function register(username: string, password: string): Promise<RegisterResponse> {
  const res = await client.post("/auth/register/", { username, password });
  return res.data as RegisterResponse;
}

export async function refreshAccessToken(refresh: string): Promise<string> {
  const res = await client.post("/auth/refresh/", { refresh });
  return res.data.access as string;
}

export async function fetchMe(token?: string): Promise<UserMe> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await client.get("/auth/me/", { headers });
  return res.data as UserMe;
}
