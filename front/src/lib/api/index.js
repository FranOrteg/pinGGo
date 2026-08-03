// Dev: direct calls to http://localhost:4000/api — same-site as frontend (localhost), cookies work.
// Prod: set VITE_API_URL to deployed backend URL.
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

let _accessToken = null;
let _refreshing = null;

export function setAccessToken(token) {
  _accessToken = token;
}

// Non-authenticated auth routes — never trigger a refresh/retry loop on them.
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'];

async function refreshAccessToken() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // refresh_token cookie
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.accessToken) {
        _accessToken = data.accessToken;
        return data.accessToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      _refreshing = null;
    }
  })();
  return _refreshing;
}

async function request(method, path, body, { retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include', // sends the httpOnly refresh_token cookie automatically
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  // Access token expired (15 min TTL) — refresh once and retry the request.
  if (res.status === 401 && !retried && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    const newToken = await refreshAccessToken();
    if (newToken) return request(method, path, body, { retried: true });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? 'Request failed'), { status: res.status });
  }

  return res.json();
}

export const api = {
  get:    (path)       => request('GET',    path),
  post:   (path, body) => request('POST',   path, body),
  put:    (path, body) => request('PUT',    path, body),
  patch:  (path, body) => request('PATCH',  path, body),
  delete: (path)       => request('DELETE', path),
};
