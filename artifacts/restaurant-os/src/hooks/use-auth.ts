import { useLocation } from "wouter";
import { getApiUrl } from "@/lib/api-env";

const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function useLogout() {
  const [, navigate] = useLocation();

  return async function logout() {
    const token = getToken();
    clearToken();
    try {
      await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // ignore network errors on logout
    }
    navigate("/login");
  };
}
