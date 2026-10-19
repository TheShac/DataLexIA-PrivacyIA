import type { ExtendedError } from "socket.io";
import type { AppSocket } from "#src/types.js";

export function socketAuthMiddleware(socket: AppSocket, next: (err?: ExtendedError) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  // TODO: verify token and set socket.data.userId. Open for now (hola mundo).
  if (token) {
    socket.data.userId = token;
  }
  next();
}
