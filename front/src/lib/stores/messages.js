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

/** Register real-time socket listeners. Returns cleanup function. */
export function bindSocketListeners(socket) {
  function onNewMessage({ channelId, message }) {
    messagesByChannel.update((state) => ({
      ...state,
      [channelId]: [...(state[channelId] ?? []), message],
    }));
  }

  function onTypingStart({ channelId, username }) {
    typingByChannel.update((state) => ({
      ...state,
      [channelId]: [...new Set([...(state[channelId] ?? []), username])],
    }));
  }

  function onTypingStop({ channelId, username }) {
    typingByChannel.update((state) => ({
      ...state,
      [channelId]: (state[channelId] ?? []).filter((u) => u !== username),
    }));
  }

  socket.on('message:new', onNewMessage);
  socket.on('typing:start', onTypingStart);
  socket.on('typing:stop', onTypingStop);

  return () => {
    socket.off('message:new', onNewMessage);
    socket.off('typing:start', onTypingStart);
    socket.off('typing:stop', onTypingStop);
  };
}
