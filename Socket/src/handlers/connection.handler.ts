import { SOCKET_EVENTS } from "#src/events.js";
import type { AppServer, AppSocket } from "#src/types.js";

export function registerConnectionHandlers(_io: AppServer, socket: AppSocket) {
  socket.on(SOCKET_EVENTS.PING, () => {
    socket.emit(SOCKET_EVENTS.PONG, { message: "Hola mundo", at: new Date().toISOString() });
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket ${socket.id} disconnected: ${reason}`);
  });
}
