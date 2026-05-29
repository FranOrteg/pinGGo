import { writable } from 'svelte/store';

export const unread = writable({});

export function initUnread(channels) {
  const map = {};
  for (const ch of channels) {
    map[ch.uuid] = Number(ch.unread_count ?? 0);
  }
  unread.set(map);
}

export function incrementUnread(channelId) {
  unread.update((s) => ({ ...s, [channelId]: (s[channelId] ?? 0) + 1 }));
}

export function clearUnread(channelId) {
  unread.update((s) => ({ ...s, [channelId]: 0 }));
}
