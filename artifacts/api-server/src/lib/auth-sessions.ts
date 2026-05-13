const globalState = globalThis as typeof globalThis & {
  __restaurantOsRevokedSessions?: Set<string>;
};

globalState.__restaurantOsRevokedSessions ??= new Set<string>();

export function revokeRuntimeSession(sessionId: string | undefined): void {
  if (sessionId) globalState.__restaurantOsRevokedSessions?.add(sessionId);
}

export function isRuntimeSessionRevoked(sessionId: string | undefined): boolean {
  return Boolean(sessionId && globalState.__restaurantOsRevokedSessions?.has(sessionId));
}
