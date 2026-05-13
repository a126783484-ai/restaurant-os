import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { isRuntimeSessionRevoked } from "../lib/auth-sessions";

type AuthRole = "admin" | "manager" | "staff" | "kitchen";

type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: AuthRole;
  sessionId?: string;
};

const rolePermissions: Record<AuthRole, string[]> = {
  admin: ["*"],
  manager: ["dashboard:read", "orders:write", "kds:write", "inventory:write", "reservations:write", "customers:write", "staff:read"],
  staff: ["dashboard:read", "orders:write", "reservations:write", "customers:read", "inventory:read"],
  kitchen: ["orders:read", "kds:write"],
};

function sendAuthError(res: Response, status: 401 | 403, code: string, message: string): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    message,
    timestamp: new Date().toISOString(),
  });
}

function getBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

function normalizeRole(role: unknown): AuthRole | null {
  return role === "admin" || role === "manager" || role === "staff" || role === "kitchen"
    ? role
    : null;
}

export function getRequestUser(req: Request): AuthUser | null {
  return (req as Request & { user?: AuthUser }).user ?? null;
}

export const requireAuth: RequestHandler = (req, res, next): void => {
  try {
    const token = (req as any).cookies?.token ?? getBearerToken(req);

    if (!token) {
      sendAuthError(res, 401, "AUTH_REQUIRED", "Authentication is required.");
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "secret") as JwtPayload;
    const role = normalizeRole(decoded.role);
    const id = typeof decoded.sub === "string" ? Number(decoded.sub) : Number(decoded.id);

    if (!Number.isInteger(id) || !decoded.email || !decoded.name || !role) {
      sendAuthError(res, 401, "AUTH_INVALID_TOKEN", "Authentication token is invalid.");
      return;
    }

    const sessionId = typeof decoded.sid === "string" ? decoded.sid : undefined;
    if (isRuntimeSessionRevoked(sessionId)) {
      sendAuthError(res, 401, "AUTH_SESSION_REVOKED", "Authentication session has been logged out.");
      return;
    }

    (req as Request & { user?: AuthUser }).user = {
      id,
      email: String(decoded.email),
      name: String(decoded.name),
      role,
      sessionId,
    };

    next();
  } catch (_error) {
    sendAuthError(res, 401, "AUTH_INVALID_TOKEN", "Authentication token is invalid or expired.");
  }
};

export const requireRole = (roles: AuthRole[] = []): RequestHandler => {
  return (req, res, next): void => {
    const user = getRequestUser(req);
    if (!user) {
      sendAuthError(res, 401, "AUTH_REQUIRED", "Authentication is required.");
      return;
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
      sendAuthError(res, 403, "AUTH_FORBIDDEN", "You do not have permission to access this resource.");
      return;
    }

    next();
  };
};

export const requirePermission = (permission: string): RequestHandler => {
  return (req, res, next): void => {
    const user = getRequestUser(req);
    if (!user) {
      sendAuthError(res, 401, "AUTH_REQUIRED", "Authentication is required.");
      return;
    }

    const permissions = rolePermissions[user.role] ?? [];
    if (!permissions.includes("*") && !permissions.includes(permission)) {
      sendAuthError(res, 403, "AUTH_FORBIDDEN", "You do not have permission to perform this action.");
      return;
    }

    next();
  };
};

export type { AuthRole, AuthUser };
