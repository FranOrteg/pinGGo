import { writable, get } from 'svelte/store';
import { api } from '$lib/api/index.js';
import { getSocket } from '$lib/socket/client.js';
import { activeChannelId } from '$lib/stores/channels.js';
import { incrementUnread } from '$lib/stores/unread.js';

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
      ? [...data.messages, ...(state[channelId] ?? [])]
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

export async function editMessage(messageId, content) {
  return api.patch(`/messages/${messageId}`, { content });
}

export async function deleteMessage(messageId) {
  return api.delete(`/messages/${messageId}`);
}

export async function toggleReaction(messageId, emoji, isMine) {
  if (isMine) {
    return api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  } else {
    return api.post(`/messages/${messageId}/reactions`, { emoji });
  }
}

/** Register real-time socket listeners. Returns cleanup function. */
export function bindSocketListeners(socket) {
  function onNewMessage({ channelId, message }) {
    messagesByChannel.update((state) => ({
      ...state,
      [channelId]: [...(state[channelId] ?? []), message],
    }));
    if (get(activeChannelId) !== channelId) {
      incrementUnread(channelId);
    }
  }

  function onMessageUpdated({ channelId, message }) {
    messagesByChannel.update((state) => ({
      ...state,
      [channelId]: (state[channelId] ?? []).map((m) =>
        m.uuid === message.uuid ? message : m
      ),
    }));
  }

  function onMessageDeleted({ channelId, messageId }) {
    messagesByChannel.update((state) => ({
      ...state,
      [channelId]: (state[channelId] ?? []).filter((m) => m.uuid !== messageId),
    }));
  }

  function onMessageReaction({ channelId, messageId, reactions }) {
    messagesByChannel.update((state) => ({
      ...state,
      [channelId]: (state[channelId] ?? []).map((m) =>
        m.uuid === messageId ? { ...m, reactions } : m
      ),
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
  socket.on('message:updated', onMessageUpdated);
  socket.on('message:deleted', onMessageDeleted);
  socket.on('message:reaction', onMessageReaction);
  socket.on('typing:start', onTypingStart);
  socket.on('typing:stop', onTypingStop);

  return () => {
    socket.off('message:new', onNewMessage);
    socket.off('message:updated', onMessageUpdated);
    socket.off('message:deleted', onMessageDeleted);
    socket.off('message:reaction', onMessageReaction);
    socket.off('typing:start', onTypingStart);
    socket.off('typing:stop', onTypingStop);
  };
}

