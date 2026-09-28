import { verifyAccessTokenWithGrace } from '../../services/tokenService.js';

/**
 * The Skylab front reuses the handshake token on every reconnect and never refreshes it,
 * so expired tokens are accepted within the same grace window as /api/auth/refresh
 * (a token that can still be refreshed grants no more access than this).
 */
export function authSocketMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  const payload = verifyAccessTokenWithGrace(token);
  if (!payload) return next(new Error('Invalid or expired token'));

  socket.data.user = payload;
  next();
}
