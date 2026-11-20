import { Router } from "express";
import ragRoutes from "#src/modules/rag/rag.routes.js";
import authRoutes from "#src/modules/auth/auth.routes.js";
import usersRoutes from "#src/modules/users/users.routes.js";
import documentsRoutes from "#src/modules/documents/documents.routes.js";
import analysesRoutes from "#src/modules/analyses/analyses.routes.js";
import findingsRoutes from "#src/modules/findings/findings.routes.js";
import chatRoutes from "#src/modules/chat/chat.routes.js";
import feedbackRoutes from "#src/modules/feedback/feedback.routes.js";
import { authMiddleware } from "#src/middlewares/auth.middleware.js";

const router = Router();

router.get("/hola", (_req, res) => {
  res.json({ message: "Hola mundo", pnpm: true });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/documents", documentsRoutes);
router.use("/analyses", analysesRoutes);
router.use("/findings", findingsRoutes);
router.use("/chat", chatRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/rag", authMiddleware, ragRoutes);

export default router;
