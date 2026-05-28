import { writable } from 'svelte/store';
import { api } from '$lib/api/index.js';
import { getSocket } from '$lib/socket/client.js';

/** { [channelId]: Message[] } */
export const messagesByChannel = writable({});

/** { [channelId]: string[] } — usernames currently typing */
export const typingByChannel = writable({});

export async function loadMessages(channelId, before = null) {
  const qs = before ? `?before=${before}` : '';
  const data = await api.get(`/channels/${channelId}/messages${qs}`);

  messagesByChannel.update((state) => ({
    ...state,
    [channelId]: before
      ? [...data.messages, ...(state[channelId] ?? [])] // prepend older messages
      : data.messages,
  }));

  return data;
}

export function sendMessage(channelId, content) {
  const socket = getSocket();
  if (!socket?.connected) throw new Error('Socket not connected');
  socket.emit('message:send', { channelId, content });
}

let _typingTimer = null;

export function notifyTyping(channelId) {
  const socket = getSocket();
  if (!socket) return;
  socket.emit('typing:start', { channelId });

  clearTimeout(_typingTimer);
  _typingTimer = setTimeout(() => {
    socket.emit('typing:stop', { channelId });
  }, 2000);
}

/** Register real-time socket listeners. Call once after socket is ready. */
export function bindSocketListeners(socket) {
  socket.on('message:new', ({ channelId, message }) => {
    messagesByChannel.update((state) => ({
      ...state,
      [channelId]: [...(state[channelId] ?? []), message],
    }));
  });

  socket.on('typing:start', ({ channelId, username }) => {
    typingByChannel.update((state) => ({
      ...state,
      [channelId]: [...new Set([...(state[channelId] ?? []), username])],
    }));
  });

  socket.on('typing:stop', ({ channelId, username }) => {
    typingByChannel.update((state) => ({
      ...state,
      [channelId]: (state[channelId] ?? []).filter((u) => u !== username),
    }));
  });
}
