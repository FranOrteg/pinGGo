import { writable } from 'svelte/store';

/** { [userUuid]: 'online' | 'away' | 'dnd' | 'offline' } */
export const presence = writable({});

export function bindPresenceListeners(socket) {
  socket.on('presence:change', ({ userUuid, status }) => {
    presence.update((state) => ({ ...state, [userUuid]: status }));
  });
}
