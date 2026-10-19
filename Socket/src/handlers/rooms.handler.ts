import { SOCKET_EVENTS } from "#src/events.js";
import type { AppServer, AppSocket } from "#src/types.js";

export function registerRoomHandlers(_io: AppServer, socket: AppSocket) {
  socket.on(SOCKET_EVENTS.ROOM_JOIN, async (room) => {
    await socket.join(room);
    socket.emit(SOCKET_EVENTS.ROOM_JOINED, room);
  });

  socket.on(SOCKET_EVENTS.ROOM_LEAVE, async (room) => {
    await socket.leave(room);
    socket.emit(SOCKET_EVENTS.ROOM_LEFT, room);
  });
}
