import { env } from "#src/config/env.js";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { registerHandlers } from "#src/handlers/index.js";
import { socketAuthMiddleware } from "#src/middlewares/auth.middleware.js";
import type { AppServer } from "#src/types.js";

let io: AppServer | null = null;

export function initSocket(httpServer: HttpServer): AppServer {
  io = new Server(httpServer, { cors: { origin: env.corsOrigin } });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    console.log(`Socket ${socket.id} connected`);
    registerHandlers(io!, socket);
  });

  return io;
}

// Lets services/controllers emit: getIO().to(room).emit(...)
export function getIO(): AppServer {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
