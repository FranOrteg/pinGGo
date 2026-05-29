import { writable, derived, get } from 'svelte/store';
import { api } from '$lib/api/index.js';
import { getSocket } from '$lib/socket/client.js';

export const channels = writable([]);
export const activeChannelId = writable(null);

export const currentChannel = derived(
  [channels, activeChannelId],
  ([$channels, $id]) => $channels.find((c) => c.uuid === $id) ?? null
);

export async function loadChannels() {
  const data = await api.get('/channels');
  channels.set(data.channels);
  return data.channels;
}

export async function createChannel(name, description = '', isPrivate = false) {
  const data = await api.post('/channels', {
    name,
    description,
    type: isPrivate ? 'private' : 'channel',
  });
  channels.update((list) => [...list, data.channel]);
  return data.channel;
}

export async function createDM(userUuid) {
  const data = await api.post('/channels', { type: 'direct', memberUuids: [userUuid] });
  channels.update((list) => {
    // Avoid duplicates if DM already exists
    const exists = list.some((c) => c.uuid === data.channel.uuid);
    return exists ? list : [...list, data.channel];
  });
  return data.channel;
}

export function setActiveChannel(channelId) {
  activeChannelId.set(channelId);
  getSocket()?.emit('channel:join', { channelId });
}
