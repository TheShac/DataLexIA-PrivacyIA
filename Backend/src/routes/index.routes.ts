import { Router } from "express";
// import exampleRoutes from "#src/modules/example/routes/example.routes.js";

const router = Router();

router.get("/hola", (_req, res) => {
  res.json({ message: "Hola mundo", pnpm: true });
});

// router.use("/example", exampleRoutes);

export default router;
