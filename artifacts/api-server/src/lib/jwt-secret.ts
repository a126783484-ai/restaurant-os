const DEV_JWT_SECRET = "dev-smoke-secret";

function normalizeSecret(secret: string | undefined): string | null {
  const normalized = secret?.trim();
  return normalized ? normalized : null;
}

export function getJwtSecret(): string {
  const configuredSecret = normalizeSecret(process.env.JWT_SECRET);

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured in production.");
  }

  return DEV_JWT_SECRET;
}

export function assertJwtSecretConfigured(): void {
  void getJwtSecret();
}
