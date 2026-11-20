import type { Request, Response, NextFunction } from "express";
import multer from "multer";

export const MAX_FILE_MB = 50;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 } });

/** Recibe un único archivo (campo multipart "file") en memoria y normaliza su nombre a UTF-8. */
export const uploadFile = (req: Request, res: Response, next: NextFunction) =>
  upload.single("file")(req, res, (err) => {
    if (err) {
      const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? `El archivo supera ${MAX_FILE_MB} MB` : err.message });
    }
    if (req.file) req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8"); // multer entrega latin1
    next();
  });
