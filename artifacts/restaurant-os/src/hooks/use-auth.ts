import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getApiUrl } from "@/lib/api-env";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export type AuthRole = "admin" | "manager" | "staff" | "kitchen";
export type AuthMode = "login" | "register";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
};

type AuthRequest = {
  name?: string;
  email: string;
  password: string;
  confirmPassword?: string;
  role?: AuthRole;
  accountType?: AuthRole;
};

type AuthResponse = {
  ok?: unknown;
  token?: unknown;
  message?: unknown;
  user?: unknown;
  error?: { message?: unknown } | unknown;
};

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as AuthUser;
  return (
    typeof user.id === "number" &&
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    (user.role === "admin" || user.role === "manager" || user.role === "staff" || user.role === "kitchen")
  );
}

function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isAuthUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getErrorMessage(data: AuthResponse, fallback: string): string {
  if (data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") {
    return data.error.message;
  }

  return typeof data.message === "string" ? data.message : fallback;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getCurrentUser(): AuthUser | null {
  return getStoredUser();
}

export async function authenticateWithPassword(mode: AuthMode, input: AuthRequest): Promise<AuthUser> {
  const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const res = await fetch(getApiUrl(endpoint), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await res.json().catch(() => ({}))) as AuthResponse;

  if (!res.ok) {
    throw new Error(getErrorMessage(data, mode === "register" ? "註冊失敗，請檢查資料後再試。" : "帳號或密碼不正確。"));
  }

  if (typeof data.token !== "string" || !data.token) {
    throw new Error("登入成功但伺服器未回傳有效 token。");
  }

  if (!isAuthUser(data.user)) {
    throw new Error("登入成功但伺服器未回傳有效使用者資料。");
  }

  setAuthSession(data.token, data.user);
  return data.user;
}

export async function validateStoredSession(): Promise<AuthUser> {
  const token = getToken();
  if (!token) {
    throw new Error("尚未登入。");
  }

  const res = await fetch(getApiUrl("/api/auth/me"), {
    method: "GET",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json().catch(() => ({}))) as AuthResponse;
  if (!res.ok) {
    clearToken();
    throw new Error(getErrorMessage(data, "登入已失效，請重新登入。"));
  }

  if (!isAuthUser(data.user)) {
    clearToken();
    throw new Error("登入狀態無效，請重新登入。");
  }

  setAuthSession(token, data.user);
  return data.user;
}

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    validateStoredSession()
      .then((sessionUser) => {
        if (!cancelled) {
          setUser(sessionUser);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setUser(null);
          setError(err instanceof Error ? err.message : "登入已失效，請重新登入。");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading, error };
}

export function useLogout() {
  const [, navigate] = useLocation();

  return async function logout() {
    const token = getToken();
    clearToken();
    try {
      await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // Best-effort logout: local credentials are already cleared.
    }
    navigate("/login");
  };
}
