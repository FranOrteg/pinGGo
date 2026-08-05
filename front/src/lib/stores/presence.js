import { writable } from 'svelte/store';
import { authUser } from './auth.js';

/** { [userUuid]: 'online' | 'away' | 'dnd' | 'offline' } */
export const presence = writable({});

export function bindPresenceListeners(socket) {
  function onPresenceChange({ userUuid, status }) {
    presence.update((state) => ({ ...state, [userUuid]: status }));

    // Keep authUser.status in sync for the current user
    authUser.update((user) => {
      if (user && user.uuid === userUuid) {
        return { ...user, status };
      }
      return user;
    });
  }

  socket.on('presence:change', onPresenceChange);

  return () => {
    socket.off('presence:change', onPresenceChange);
  };
}
