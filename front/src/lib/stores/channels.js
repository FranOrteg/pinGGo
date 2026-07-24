import { writable, derived, get } from 'svelte/store';
import { api } from '$lib/api/index.js';
import { getSocket } from '$lib/socket/client.js';
import { initUnread, clearUnread } from '$lib/stores/unread.js';

export const channels = writable([]);
export const activeChannelId = writable(null);

export const currentChannel = derived(
  [channels, activeChannelId],
  ([$channels, $id]) => $channels.find((c) => c.uuid === $id) ?? null
);

export async function loadChannels() {
  const data = await api.get('/channels');
  channels.set(data.channels);
  initUnread(data.channels);
  return data.channels;
}

export async function createChannel(name, description = '', isPrivate = false, memberUuids = []) {
  const data = await api.post('/channels', {
    name,
    description,
    type: isPrivate ? 'private' : 'channel',
    memberUuids,
  });
  channels.update((list) => [...list, data.channel]);
  return data.channel;
}

export async function createDM(userUuid) {
  const data = await api.post('/channels', { type: 'direct', memberUuids: [userUuid] });
  channels.update((list) => {
    const exists = list.some((c) => c.uuid === data.channel.uuid);
    return exists ? list : [...list, data.channel];
  });
  return data.channel;
}

export function setActiveChannel(channelId) {
  activeChannelId.set(channelId);
  getSocket()?.emit('channel:join', { channelId });
  clearUnread(channelId);
  api.post(`/channels/${channelId}/read`).catch(() => {});
}

/** Call once after socket is created — re-joins active channel on every reconnect */
export function bindChannelReconnect(socket) {
  socket.on('connect', () => {
    const id = get(activeChannelId);
    if (id) socket.emit('channel:join', { channelId: id });
  });
}
