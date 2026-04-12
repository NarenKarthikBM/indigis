export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface UserMe {
  username: string;
  role: "viewer" | "editor" | "admin";
}

export interface RegisterResponse extends AuthTokens {
  username: string;
  role: string;
}
