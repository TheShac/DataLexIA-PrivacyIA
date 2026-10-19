export const SOCKET_EVENTS = {
  // client -> server
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  PING: "ping:test",
  // server -> client
  ROOM_JOINED: "room:joined",
  ROOM_LEFT: "room:left",
  PONG: "pong:test",
  ERROR: "socket:error",
} as const;
