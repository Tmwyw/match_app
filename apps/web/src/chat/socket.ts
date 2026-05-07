import { io, type Socket } from "socket.io-client";
import { getToken } from "../api";

const VITE_API_URL = import.meta.env.VITE_API_URL;

let socket: Socket | null = null;

export function getChatSocket(): Socket {
  if (socket) return socket;

  const url = VITE_API_URL ? `${VITE_API_URL}/chat` : "/chat";
  const path = VITE_API_URL ? "/socket.io" : "/api/socket.io";

  socket = io(url, {
    path,
    transports: ["websocket"],
    autoConnect: true,
    reconnection: true,
    // Infinite retries with a low ceiling on backoff: Telegram webviews
    // (especially iOS) sometimes pause JS during native prompts / haptics
    // / OS multitasking, which kills our heartbeat. We saw a clean ~30s
    // gap with the previous default (5 attempts × 1,2,4,8,16s backoff).
    // With these values the same hiccup heals in 1-2s tops.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10_000,
    auth: (cb) => cb({ token: getToken() ?? "" }),
  });

  socket.on("connect_error", (err) => {
    const msg = err.message?.toLowerCase() ?? "";
    // Server disconnected us for auth — don't try to reconnect in a loop.
    if (msg.includes("auth") || msg.includes("unauth")) {
      socket?.disconnect();
    }
  });

  return socket;
}

export function disposeChatSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
