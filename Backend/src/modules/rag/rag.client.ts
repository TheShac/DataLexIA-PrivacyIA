import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { env } from "#src/config/env.js";

// La revisión de cumplimiento puede tardar varios minutos (modelo local).
const TIMEOUT_MS = 30 * 60 * 1000;

/** Cabecera con la clave de FastAPI; la clave vive solo en el Backend y nunca llega al navegador. */
const apiKeyHeader = (): Record<string, string> => (env.fastapiApiKey ? { "x-api-key": env.fastapiApiKey } : {});

/**
 * Reenvía la petición a FastAPI y devuelve su respuesta tal cual (status, content-type y cuerpo).
 * - JSON: se vuelve a serializar el body ya parseado por express.json().
 * - multipart (subida de archivos): se reenvía el stream original sin parsearlo.
 */
export async function forward(req: Request, res: Response, path: string): Promise<void> {
  const url = new URL(env.fastapiUrl + path);
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  if (req.method !== "GET" && req.method !== "DELETE") {
    const contentType = req.headers["content-type"] ?? "";
    if (contentType.startsWith("multipart/")) {
      init.headers = {
        "content-type": contentType,
        ...(req.headers["content-length"] && { "content-length": req.headers["content-length"] }),
      };
      init.body = Readable.toWeb(req) as unknown as ReadableStream;
      init.duplex = "half";
    } else {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(req.body ?? {});
    }
  }

  init.headers = { ...(init.headers as Record<string, string> | undefined), ...apiKeyHeader() };

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "FastAPI tardó demasiado en responder" : `No se pudo conectar con FastAPI en ${env.fastapiUrl}`,
    });
    return;
  }

  res.status(upstream.status);
  res.type(upstream.headers.get("content-type") ?? "application/json");
  res.send(Buffer.from(await upstream.arrayBuffer()));
}

export interface RagResult<T = any> {
  status: number;
  ok: boolean;
  body: T;
}

/**
 * Llamada interna a FastAPI (sin reenviar al cliente). Lanza 502/504 si FastAPI no responde;
 * si responde con error HTTP devuelve { ok: false } para que el llamador decida.
 */
export async function ragCall<T = any>(method: "GET" | "POST" | "DELETE", path: string, payload?: FormData | Record<string, unknown>): Promise<RagResult<T>> {
  let upstream: globalThis.Response;
  try {
    const isForm = payload instanceof FormData;
    upstream = await fetch(env.fastapiUrl + path, {
      method,
      headers: { ...(payload && !isForm ? { "content-type": "application/json" } : {}), ...apiKeyHeader() },
      body: payload ? (isForm ? payload : JSON.stringify(payload)) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw Object.assign(new Error(timedOut ? "FastAPI tardó demasiado en responder" : `No se pudo conectar con FastAPI en ${env.fastapiUrl}`), {
      status: timedOut ? 504 : 502,
    });
  }
  const text = await upstream.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* respuesta no JSON: se deja como texto */
  }
  return { status: upstream.status, ok: upstream.ok, body };
}
