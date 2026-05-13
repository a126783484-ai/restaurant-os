import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { isDatabaseConfigured, pool } from "@workspace/db";
import { getRequestUser, requireAuth, type AuthRole, type AuthUser } from "../middlewares/auth";
import { revokeRuntimeSession } from "../lib/auth-sessions";

const router: IRouter = Router();

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_MAX_AGE_MS = TOKEN_TTL_SECONDS * 1000;
const VALID_ROLES: AuthRole[] = ["admin", "manager", "staff", "kitchen"];
const DEFAULT_ROLE: AuthRole = "manager";

type StoredUser = AuthUser & {
  passwordHash: string;
  active: boolean;
};

type RegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  role?: unknown;
  accountType?: unknown;
};

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

const memoryUsers = new Map<string, StoredUser>();
let memoryUserId = 1;
let authSchemaReady: Promise<void> | null = null;

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    message,
    timestamp: new Date().toISOString(),
  });
}

function sendAuthSuccess(res: Response, token: string, user: AuthUser): void {
  setTokenCookie(res, token);
  res.status(200).json({
    ok: true,
    token,
    user,
    message: "Authentication successful.",
    timestamp: new Date().toISOString(),
  });
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(email: unknown): string {
  return normalizeString(email).toLowerCase();
}

function normalizePassword(password: unknown): string {
  return typeof password === "string" ? password : "";
}

function normalizeRole(value: unknown): AuthRole {
  const role = normalizeString(value).toLowerCase();
  return VALID_ROLES.includes(role as AuthRole) ? role as AuthRole : DEFAULT_ROLE;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function createToken(user: AuthUser, sessionId: string): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sid: sessionId,
    },
    process.env.JWT_SECRET ?? "secret",
    {
      expiresIn: TOKEN_TTL_SECONDS,
      subject: String(user.id),
    },
  );
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setTokenCookie(res: Response, token: string): void {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_MAX_AGE_MS,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
}

function clearTokenCookie(res: Response): void {
  res.clearCookie("token", {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
}

async function ensureAuthSchema(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  authSchemaReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'manager',
        account_type TEXT NOT NULL DEFAULT 'manager',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })();

  await authSchemaReady;
}

async function findUserByEmail(email: string): Promise<StoredUser | null> {
  if (!isDatabaseConfigured()) {
    return memoryUsers.get(email) ?? null;
  }

  await ensureAuthSchema();
  const result = await pool.query<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    active: boolean;
  }>(
    "SELECT id, name, email, password_hash, role, active FROM users WHERE email = $1 LIMIT 1",
    [email],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: normalizeRole(row.role),
    active: row.active,
  };
}

async function createUser(input: { name: string; email: string; password: string; role: AuthRole }): Promise<StoredUser> {
  const passwordHash = await bcrypt.hash(input.password, 12);

  if (!isDatabaseConfigured()) {
    const existing = memoryUsers.get(input.email);
    if (existing) {
      throw Object.assign(new Error("Email is already registered."), { statusCode: 409, code: "AUTH_EMAIL_EXISTS" });
    }

    const user: StoredUser = {
      id: memoryUserId++,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      active: true,
    };
    memoryUsers.set(input.email, user);
    return user;
  }

  await ensureAuthSchema();
  try {
    const result = await pool.query<{
      id: number;
      name: string;
      email: string;
      password_hash: string;
      role: string;
      active: boolean;
    }>(
      `INSERT INTO users (name, email, password_hash, role, account_type)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id, name, email, password_hash, role, active`,
      [input.name, input.email, passwordHash, input.role],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      role: normalizeRole(row.role),
      active: row.active,
    };
  } catch (error: any) {
    if (error?.code === "23505") {
      throw Object.assign(new Error("Email is already registered."), { statusCode: 409, code: "AUTH_EMAIL_EXISTS" });
    }
    throw error;
  }
}

async function createSession(req: Request, user: AuthUser, token: string, sessionId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await ensureAuthSchema();
  await pool.query(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' seconds')::interval)`,
    [sessionId, user.id, hashToken(token), req.header("user-agent") ?? null, req.ip ?? null, TOKEN_TTL_SECONDS],
  );
}

async function revokeSession(sessionId: string | undefined): Promise<void> {
  revokeRuntimeSession(sessionId);
  if (!sessionId || !isDatabaseConfigured()) return;
  await ensureAuthSchema();
  await pool.query("UPDATE sessions SET revoked = TRUE, updated_at = NOW() WHERE id = $1", [sessionId]);
}

async function issueToken(req: Request, user: AuthUser): Promise<string> {
  const sessionId = crypto.randomUUID();
  const token = createToken(user, sessionId);
  await createSession(req, user, token, sessionId);
  return token;
}

function validateRegisterBody(body: RegisterBody, res: Response): { name: string; email: string; password: string; role: AuthRole } | null {
  const name = normalizeString(body.name);
  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);
  const confirmPassword = normalizePassword(body.confirmPassword);
  const role = normalizeRole(body.role ?? body.accountType);

  if (!name) {
    sendError(res, 400, "AUTH_NAME_REQUIRED", "Name is required.");
    return null;
  }
  if (!isValidEmail(email)) {
    sendError(res, 400, "AUTH_EMAIL_INVALID", "A valid email is required.");
    return null;
  }
  if (password.length < 8) {
    sendError(res, 400, "AUTH_PASSWORD_WEAK", "Password must be at least 8 characters.");
    return null;
  }
  if (password !== confirmPassword) {
    sendError(res, 400, "AUTH_PASSWORD_MISMATCH", "Password confirmation does not match.");
    return null;
  }

  return { name, email, password, role };
}

router.post("/auth/register", async (req, res, next): Promise<void> => {
  const parsed = validateRegisterBody(req.body ?? {}, res);
  if (!parsed) return;

  try {
    const user = await createUser(parsed);
    const publicUser = safeUser(user);
    const token = await issueToken(req, publicUser);
    sendAuthSuccess(res, token, publicUser);
  } catch (error: any) {
    if (error?.statusCode) {
      sendError(res, error.statusCode, error.code ?? "AUTH_REGISTER_FAILED", error.message);
      return;
    }
    next(error);
  }
});

router.post("/auth/login", async (req, res, next): Promise<void> => {
  const body = (req.body ?? {}) as LoginBody;
  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);

  if (!isValidEmail(email) || !password) {
    sendError(res, 400, "AUTH_CREDENTIALS_REQUIRED", "Email and password are required.");
    return;
  }

  try {
    const user = await findUserByEmail(email);
    if (!user || !user.active) {
      sendError(res, 401, "AUTH_INVALID_CREDENTIALS", "Email or password is incorrect.");
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      sendError(res, 401, "AUTH_INVALID_CREDENTIALS", "Email or password is incorrect.");
      return;
    }

    const publicUser = safeUser(user);
    const token = await issueToken(req, publicUser);
    sendAuthSuccess(res, token, publicUser);
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", requireAuth, (req, res): void => {
  const user = getRequestUser(req);
  if (!user) {
    sendError(res, 401, "AUTH_REQUIRED", "Authentication is required.");
    return;
  }

  res.status(200).json({
    ok: true,
    user,
    timestamp: new Date().toISOString(),
  });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const user = getRequestUser(req);
  await revokeSession(user?.sessionId);
  clearTokenCookie(res);
  res.status(200).json({
    ok: true,
    message: "Logged out.",
    timestamp: new Date().toISOString(),
  });
});

export default router;
