import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware } from "#src/middlewares/auth.middleware.js";
import { users, roles } from "#src/modules/users/schema/users.schema.js";
import { sessions } from "#src/modules/auth/schema/auth.schema.js";
import { audit, createSession, LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from "#src/modules/auth/auth.service.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const invalid = () => res.status(401).json({ error: "Credenciales inválidas" });

    if (!user || user.status !== "activo") {
      await audit(req, { action: "auth.login_failed", details: { email, reason: user ? "desactivado" : "desconocido" } });
      return invalid();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await audit(req, { userId: user.id, action: "auth.login_blocked", entityType: "user", entityId: user.id });
      return res.status(423).json({ error: "Cuenta bloqueada temporalmente por intentos fallidos", lockedUntil: user.lockedUntil });
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await db
        .update(users)
        .set({ failedLoginAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, user.id));
      await audit(req, { userId: user.id, action: lock ? "auth.account_locked" : "auth.login_failed", entityType: "user", entityId: user.id });
      return invalid();
    }

    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const token = await createSession(user.id, req);
    await audit(req, { userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });

    const [role] = await db.select({ code: roles.code, name: roles.name }).from(roles).where(eq(roles.id, user.roleId));
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: role?.code } });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.user!.sessionId));
    await audit(req, { action: "auth.logout", entityType: "user", entityId: req.user!.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const [user] = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email, role: roles.code, lastLoginAt: users.lastLoginAt })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, req.user!.id));
    res.json({ ...user, permissions: req.user!.permissions });
  } catch (err) {
    next(err);
  }
});

export default router;
