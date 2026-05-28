import { writable } from 'svelte/store';
import { api } from '$lib/api/index.js';
import { getSocket } from '$lib/socket/client.js';

export const channels = writable([]);
export const activeChannelId = writable(null);

export async function loadChannels() {
  const data = await api.get('/channels');
  channels.set(data.channels);
  return data.channels;
}

export async function createChannel(name, type = 'channel', memberUuids = []) {
  const data = await api.post('/channels', { name, type, memberUuids });
  channels.update((list) => [...list, data.channel]);
  return data.channel;
}

export async function createDM(userUuid) {
  const data = await api.post('/channels', { type: 'direct', memberUuids: [userUuid] });
  channels.update((list) => [...list, data.channel]);
  return data.channel;
}

export function setActiveChannel(channelId) {
  activeChannelId.set(channelId);
  // Join the Socket.IO room for this channel
  getSocket()?.emit('channel:join', { channelId });
}
