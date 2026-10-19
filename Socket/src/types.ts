import type { Server, Socket } from "socket.io";

export interface ClientToServerEvents {
  "room:join": (room: string) => void;
  "room:leave": (room: string) => void;
  "ping:test": (payload?: unknown) => void;
}

export interface ServerToClientEvents {
  "room:joined": (room: string) => void;
  "room:left": (room: string) => void;
  "pong:test": (payload: { message: string; at: string }) => void;
  "socket:error": (payload: { message: string }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId?: string;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
