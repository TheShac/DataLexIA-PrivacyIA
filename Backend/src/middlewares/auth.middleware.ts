import type { Request, Response, NextFunction } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "#src/config/db.js";
import { hashToken, verifyToken } from "#src/modules/auth/auth.service.js";
import { sessions } from "#src/modules/auth/schema/auth.schema.js";
import { users, roles, permissions, rolePermissions } from "#src/modules/users/schema/users.schema.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string; sessionId: string; permissions: string[] };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const { userId, sessionId } = verifyToken(token);

    // La sesión debe existir, no estar revocada ni vencida, y el usuario seguir activo.
    const [row] = await db
      .select({ userId: users.id, roleId: users.roleId, role: roles.code })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          eq(users.status, "activo"),
        ),
      )
      .limit(1);
    if (!row) return res.status(401).json({ error: "Sesión inválida o expirada" });

    const perms = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, row.roleId));

    req.user = { id: row.userId, role: row.role, sessionId, permissions: perms.map((p) => p.code) };
    next();
  } catch (err) {
    // Token mal formado o vencido → 401; cualquier otro error (BD) → 500.
    if (err instanceof Error && (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError")) {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
    next(err);
  }
}

/** Exige que el usuario autenticado tenga TODOS los permisos indicados. */
export const requirePermission =
  (...codes: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !codes.every((c) => req.user!.permissions.includes(c))) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    next();
  };
