import { useLocation } from "wouter";

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
    clearToken();
    try {
      await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore network errors on logout
    }
    navigate("/login");
  };
}
