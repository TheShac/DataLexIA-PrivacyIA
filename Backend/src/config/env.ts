import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_SECONDS ?? 28800),
  fastapiUrl: (process.env.FASTAPI_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, ""),
  // Debe coincidir con RAG_API_KEY de FastAPI. Vacía = FastAPI sin protección (solo local).
  fastapiApiKey: process.env.FASTAPI_API_KEY ?? "",
  // Dónde se guardan los archivos analizados (relativa a la carpeta desde la que se arranca).
  storageDir: process.env.STORAGE_DIR || "storage",
};
