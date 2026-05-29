import { writable } from 'svelte/store';

/** { [userUuid]: 'online' | 'away' | 'dnd' | 'offline' } */
export const presence = writable({});

export function bindPresenceListeners(socket) {
  function onPresenceChange({ userUuid, status }) {
    presence.update((state) => ({ ...state, [userUuid]: status }));
  }

  socket.on('presence:change', onPresenceChange);

  return () => {
    socket.off('presence:change', onPresenceChange);
  };
}
