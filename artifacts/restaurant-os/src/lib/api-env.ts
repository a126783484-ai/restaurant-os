const DEFAULT_PRODUCTION_API_BASE_URL =
  "https://restaurant-os-api-server-jgrr2thvx-a126783484-2182s-projects.vercel.app";

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");

  if (import.meta.env.PROD) {
    return DEFAULT_PRODUCTION_API_BASE_URL;
  }

  return window.location.origin;
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
