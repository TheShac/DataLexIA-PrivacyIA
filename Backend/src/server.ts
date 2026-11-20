import app from "#src/app.js";
import { env } from "#src/config/env.js";
import { failStaleAnalyses } from "#src/modules/analyses/analyses.service.js";

await failStaleAnalyses().catch((err) => console.error("No se pudo limpiar análisis pendientes:", err));

app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});
