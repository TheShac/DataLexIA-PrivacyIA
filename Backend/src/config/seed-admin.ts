import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db } from "#src/config/db.js";
import { users, roles, permissions, rolePermissions } from "#src/modules/users/schema/users.schema.js";

// Catálogo inicial. Los permisos por rol son una propuesta: ajústalos según los requisitos.
const PERMISSIONS: Record<string, string> = {
  "users.manage": "Gestionar usuarios y roles (CU-02)",
  "documents.upload": "Cargar documentos (CU-03)",
  "documents.manage": "Gestionar documentos autorizados (CU-04)",
  "documents.read": "Consultar documentos",
  "analyses.run": "Ejecutar análisis de cumplimiento (CU-06 a CU-09)",
  "analyses.read": "Consultar análisis e historial (CU-14, CU-15)",
  "findings.review": "Revisar y validar hallazgos (CU-12)",
  "chat.use": "Usar el chat normativo (CU-10, CU-11)",
  "feedback.create": "Calificar respuestas de la IA (CU-13)",
  "audit.read": "Consultar la bitácora de auditoría",
};

const ROLES: Record<string, { name: string; description: string; permissions: string[] }> = {
  admin: { name: "Administrador", description: "Administra usuarios, roles y la plataforma", permissions: Object.keys(PERMISSIONS) },
  analista: {
    name: "Analista",
    description: "Carga documentos y ejecuta análisis",
    permissions: ["documents.upload", "documents.read", "analyses.run", "analyses.read", "chat.use", "feedback.create"],
  },
  gestor: {
    name: "Gestor documental",
    description: "Gestiona los documentos autorizados",
    permissions: ["documents.upload", "documents.manage", "documents.read", "chat.use"],
  },
  revisor: {
    name: "Revisor",
    description: "Revisa y valida hallazgos",
    permissions: ["documents.read", "analyses.read", "findings.review", "chat.use", "feedback.create"],
  },
  auditor: {
    name: "Auditor",
    description: "Consulta análisis y bitácora",
    permissions: ["documents.read", "analyses.read", "audit.read"],
  },
  direccion: { name: "Dirección", description: "Consulta resúmenes de riesgos y brechas", permissions: ["analyses.read"] },
};

for (const [code, description] of Object.entries(PERMISSIONS)) {
  await db.insert(permissions).values({ code, description }).onDuplicateKeyUpdate({ set: { description } });
}
for (const [code, { name, description }] of Object.entries(ROLES)) {
  await db.insert(roles).values({ code, name, description }).onDuplicateKeyUpdate({ set: { name, description } });
}

const permRows = await db.select().from(permissions).where(inArray(permissions.code, Object.keys(PERMISSIONS)));
const roleRows = await db.select().from(roles);
const permId = new Map(permRows.map((p) => [p.code, p.id]));
for (const role of roleRows) {
  const def = ROLES[role.code];
  if (!def) continue;
  for (const p of def.permissions) {
    await db.insert(rolePermissions).values({ roleId: role.id, permissionId: permId.get(p)! }).onDuplicateKeyUpdate({ set: { roleId: role.id } });
  }
}
console.log("Roles y permisos sincronizados");

const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
if (!email || password.length < 8) {
  console.error("Define ADMIN_EMAIL y ADMIN_PASSWORD (mín. 8 caracteres) en .env");
  process.exit(1);
}

const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
if (exists) {
  console.log("El admin ya existe");
} else {
  const adminRole = roleRows.find((r) => r.code === "admin")!;
  await db.insert(users).values({
    fullName: process.env.ADMIN_NAME ?? "Administrador",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    roleId: adminRole.id,
    passwordChangedAt: new Date(),
  });
  console.log(`Admin creado: ${email}`);
}
process.exit(0);
