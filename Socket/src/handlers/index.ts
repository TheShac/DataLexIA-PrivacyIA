import type { AppServer, AppSocket } from "#src/types.js";
import { registerConnectionHandlers } from "#src/handlers/connection.handler.js";
import { registerRoomHandlers } from "#src/handlers/rooms.handler.js";

export function registerHandlers(io: AppServer, socket: AppSocket) {
  registerConnectionHandlers(io, socket);
  registerRoomHandlers(io, socket);
}
