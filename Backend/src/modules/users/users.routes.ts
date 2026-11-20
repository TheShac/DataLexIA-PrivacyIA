import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#src/config/db.js";
import { validate } from "#src/middlewares/validate.middleware.js";
import { authMiddleware, requirePermission } from "#src/middlewares/auth.middleware.js";
import { audit } from "#src/modules/auth/auth.service.js";
import { sessions } from "#src/modules/auth/schema/auth.schema.js";
import { users, roles } from "#src/modules/users/schema/users.schema.js";

const router = Router();
router.use(authMiddleware, requirePermission("users.manage"));

const publicCols = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  role: roles.code,
  roleId: users.roleId,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};
const selectUsers = () => db.select(publicCols).from(users).innerJoin(roles, eq(roles.id, users.roleId));

const createSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(8).max(100),
  roleId: z.number().int().positive(),
});

const updateSchema = z
  .object({
    fullName: z.string().min(1).max(120),
    roleId: z.number().int().positive(),
    status: z.enum(["activo", "desactivado"]),
    password: z.string().min(8).max(100),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

const parseId = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);
const roleExists = async (id: number) => (await db.select({ id: roles.id }).from(roles).where(eq(roles.id, id)).limit(1)).length > 0;

router.get("/roles", async (_req, res, next) => {
  try {
    res.json(await db.select().from(roles));
  } catch (err) {
    next(err);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    res.json(await selectUsers());
  } catch (err) {
    next(err);
  }
});

router.post("/", validate(createSchema), async (req, res, next) => {
  try {
    const { password, ...data } = req.body as z.infer<typeof createSchema>;
    if (!(await roleExists(data.roleId))) return res.status(400).json({ error: "Rol inexistente" });
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
    if (exists) return res.status(409).json({ error: "El correo ya está registrado" });

    const [result] = await db
      .insert(users)
      .values({ ...data, passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date(), createdBy: req.user!.id });
    const [created] = await selectUsers().where(eq(users.id, result.insertId));
    await audit(req, { action: "user.create", entityType: "user", entityId: result.insertId, details: { email: data.email, roleId: data.roleId } });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", validate(updateSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const { password, ...rest } = req.body as z.infer<typeof updateSchema>;

    if (id === req.user!.id && (rest.status === "desactivado" || (rest.roleId && rest.roleId !== (await currentRoleId(id))))) {
      return res.status(400).json({ error: "No puedes desactivarte ni cambiarte el rol a ti mismo" });
    }
    if (rest.roleId && !(await roleExists(rest.roleId))) return res.status(400).json({ error: "Rol inexistente" });

    const set = {
      ...rest,
      ...(password && { passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date() }),
      ...(rest.status === "desactivado" && { deactivatedAt: new Date() }),
      ...(rest.status === "activo" && { deactivatedAt: null, failedLoginAttempts: 0, lockedUntil: null }),
    };
    const [result] = await db.update(users).set(set).where(eq(users.id, id));
    if (result.affectedRows === 0) return res.status(404).json({ error: "Usuario no encontrado" });

    // Desactivar o cambiar la clave cierra todas las sesiones del usuario.
    if (rest.status === "desactivado" || password) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
    }

    const [updated] = await selectUsers().where(eq(users.id, id));
    const { password: _omit, ...logged } = req.body as Record<string, unknown>;
    await audit(req, { action: "user.update", entityType: "user", entityId: id, details: { ...logged, passwordChanged: Boolean(password) } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

async function currentRoleId(id: number) {
  const [u] = await db.select({ roleId: users.roleId }).from(users).where(eq(users.id, id));
  return u?.roleId;
}

export default router;
