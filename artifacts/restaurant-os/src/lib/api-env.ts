const DEFAULT_PRODUCTION_API_BASE_URL =
  "https://restaurant-os-api-server-a126783484-2182s-projects.vercel.app";

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "");

  if (import.meta.env.PROD) {
    if (!trimmed) return DEFAULT_PRODUCTION_API_BASE_URL;

    const isDeploymentSpecificBackend =
      trimmed.includes("restaurant-os-api-server-") &&
      trimmed.endsWith("-a126783484-2182s-projects.vercel.app");

    if (isDeploymentSpecificBackend) {
      return DEFAULT_PRODUCTION_API_BASE_URL;
    }

    return trimmed;
  }

  return trimmed || window.location.origin;
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
