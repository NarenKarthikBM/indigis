export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  username: string | null;
  role: string | null;
  setAuth: (payload: { token: string; refreshToken: string; username: string; role: string }) => void;
  clearAuth: () => void;
}

const TOKEN_KEY = "indigis_access";
const REFRESH_KEY = "indigis_refresh";
const USERNAME_KEY = "indigis_username";
const ROLE_KEY = "indigis_role";

export function createAuthSlice(
  set: (fn: (s: AuthState) => AuthState) => void
): AuthState {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
    username: localStorage.getItem(USERNAME_KEY),
    role: localStorage.getItem(ROLE_KEY),

    setAuth({ token, refreshToken, username, role }) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(REFRESH_KEY, refreshToken);
      localStorage.setItem(USERNAME_KEY, username);
      localStorage.setItem(ROLE_KEY, role);
      set((s) => ({ ...s, token, refreshToken, username, role }));
    },

    clearAuth() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USERNAME_KEY);
      localStorage.removeItem(ROLE_KEY);
      set((s) => ({ ...s, token: null, refreshToken: null, username: null, role: null }));
    },
  };
}
