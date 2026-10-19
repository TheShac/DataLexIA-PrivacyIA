import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "#src/routes/index.routes.js";
import { errorMiddleware } from "#src/middlewares/error.middleware.js";
import { notFoundMiddleware } from "#src/middlewares/notFound.middleware.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use("/api", routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
