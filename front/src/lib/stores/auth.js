import { writable, derived } from 'svelte/store';
import { api, setAccessToken } from '$lib/api/index.js';
import { createSocketClient, disconnectSocket } from '$lib/socket/client.js';

export const authUser = writable(null);
export const accessToken = writable(null);
export const authReady = writable(false);

export const isAuthenticated = derived(authUser, ($u) => $u !== null);

export async function login(email, password) {
  const data = await api.post('/auth/login', { email, password });
  _applySession(data);
  return data;
}

export async function register(username, email, password) {
  const data = await api.post('/auth/register', { username, email, password });
  _applySession(data);
  return data;
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  authUser.set(null);
  accessToken.set(null);
  authReady.set(false);
  setAccessToken(null);
  disconnectSocket();
}

/** Called on app boot to silently restore session from the refresh cookie */
export async function refreshToken() {
  try {
    const data = await api.post('/auth/refresh');
    accessToken.set(data.accessToken);
    setAccessToken(data.accessToken);

    const me = await api.get('/auth/me');
    authUser.set(me.user);

    createSocketClient(data.accessToken);
    return data.accessToken;
  } catch {
    authUser.set(null);
    return null;
  } finally {
    authReady.set(true);
  }
}

function _applySession({ user, accessToken: token }) {
  authUser.set(user);
  accessToken.set(token);
  setAccessToken(token);
  createSocketClient(token);
}
