/**
 * Guarda el archivo original de cada documento analizado, para mostrarlo en la vista previa.
 * Son documentos de clientes SIN anonimizar: la carpeta no va a git y solo se sirve con permiso.
 *
 * El nombre en disco es el SHA-256 del contenido (nunca el nombre que envía el usuario), así que no hay
 * rutas manipulables y el mismo archivo subido dos veces ocupa una sola vez.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "#src/config/env.js";

const root = path.resolve(env.storageDir, "documents");

function pathFor(sha256: string) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Hash de documento inválido");
  return path.join(root, sha256);
}

export async function saveOriginal(sha256: string, data: Buffer) {
  await mkdir(root, { recursive: true });
  try {
    await writeFile(pathFor(sha256), data, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
}

/** Ruta del archivo guardado, o null si no está (p. ej. análisis anteriores a la vista previa). */
export async function findOriginal(sha256: string): Promise<string | null> {
  const file = pathFor(sha256);
  return access(file).then(
    () => file,
    () => null,
  );
}
