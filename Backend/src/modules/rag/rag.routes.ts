import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { forward } from "#src/modules/rag/rag.client.js";
import { requirePermission } from "#src/middlewares/auth.middleware.js";

const router = Router();

const proxy =
  (path: string | ((req: Request) => string)) => (req: Request, res: Response, next: NextFunction) =>
    forward(req, res, typeof path === "function" ? path(req) : path).catch(next);

// Estado de Postgres, Ollama y modelos
router.get("/health", proxy("/health"));

// Preguntas: { "question": "...", "k"?: number }
router.post("/ask", requirePermission("chat.use"), proxy("/ask"));

// Revisión de cumplimiento (multipart con campo "file", ?k= opcional)
router.post("/compliance", requirePermission("analyses.run"), proxy("/compliance"));

// Documentos y leyes se gestionan desde /api/documents (catálogo en MySQL + índice en FastAPI).

export default router;
