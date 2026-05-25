"use client";

import { io } from "socket.io-client";
import { BACKEND_URL } from "@/app/lib/config";

let socket;

// Single shared Socket.IO connection to the FastAPI backend.
export function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, { autoConnect: true });
  }
  return socket;
}
