import { io } from 'socket.io-client';
import { writable } from 'svelte/store';

export const socketStatus = writable('disconnected');

/** @type {import('socket.io-client').Socket | null} */
let socket = null;

export function createSocketClient(token) {
  if (socket) socket.disconnect();

  socket = io(import.meta.env.VITE_API_WS_URL ?? 'http://localhost:4000', {
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => socketStatus.set('connected'));
  socket.on('disconnect', () => socketStatus.set('disconnected'));
  socket.on('connect_error', () => socketStatus.set('error'));

  // Keep presence alive: server TTL is 35s, we ping every 25s
  const heartbeatInterval = setInterval(() => {
    if (socket?.connected) socket.emit('presence:heartbeat');
  }, 25_000);

  socket.on('disconnect', () => clearInterval(heartbeatInterval));

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketStatus.set('disconnected');
}
