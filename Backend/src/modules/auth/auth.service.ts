import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { db } from "#src/config/db.js";
import { env } from "#src/config/env.js";
import { sessions, auditLog } from "#src/modules/auth/schema/auth.schema.js";

export const MAX_FAILED_ATTEMPTS = 5; // CU-01
export const LOCK_MINUTES = 15;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function verifyToken(token: string): { userId: number; sessionId: string } {
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  if (!decoded.sub || !decoded.jti) throw new Error("Token incompleto");
  return { userId: Number(decoded.sub), sessionId: decoded.jti };
}

export async function createSession(userId: number, req: Request) {
  const id = randomUUID();
  const token = jwt.sign({}, env.jwtSecret, { subject: String(userId), jwtid: id, expiresIn: env.jwtExpiresInSeconds });
  await db.insert(sessions).values({
    id,
    userId,
    tokenHash: hashToken(token),
    ip: req.ip?.slice(0, 45),
    userAgent: req.headers["user-agent"]?.slice(0, 255),
    expiresAt: new Date(Date.now() + env.jwtExpiresInSeconds * 1000),
  });
  return token;
}

interface AuditEntry {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  details?: unknown;
}

/** Registra en audit_log. Un fallo de auditoría no debe tumbar la petición. */
export async function audit(req: Request, entry: AuditEntry) {
  try {
    await db.insert(auditLog).values({
      userId: entry.userId ?? req.user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId === undefined ? undefined : String(entry.entityId),
      details: entry.details,
      ip: req.ip?.slice(0, 45),
    });
  } catch (err) {
    console.error("audit_log:", err);
  }
}
