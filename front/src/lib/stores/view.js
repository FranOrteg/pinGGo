import { writable } from 'svelte/store';

export const activeView = writable('channel');
// 'channel' | 'profile'

let _previousChannelId = null;

export function showProfile(currentChannelId) {
  _previousChannelId = currentChannelId;
  activeView.set('profile');
}

export function showChannel() {
  activeView.set('channel');
}

export function getPreviousChannelId() {
  return _previousChannelId;
}
