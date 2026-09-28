import jwt from 'jsonwebtoken';
import config from '../config/index.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Builds the JWT payload for a user.
 * - sub:  user uuid (used across the codebase as req.user.sub / socket.data.user.sub)
 * - uuid, email, username: required by the Skylab front contract
 * - sat:  "session auth time" — when the user last proved identity (login/exchange).
 *         Preserved across refreshes so sessions have an absolute maximum age.
 */
export function buildPayload(user, sat = nowSeconds()) {
  return {
    sub: user.uuid,
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    sat,
  };
}

export function signTokens(payload) {
  const { exp, iat, ...claims } = payload; // never carry over timing claims
  const accessToken = jwt.sign(claims, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
  const refreshToken = jwt.sign(claims, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
}

function sessionTooOld(payload) {
  return typeof payload.sat === 'number' && nowSeconds() - payload.sat > config.jwt.sessionMaxAgeSeconds;
}

/** Strict verification (REST requests). Throws on invalid or expired tokens. */
export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

/**
 * Verifies the signature but tolerates expiry within the grace window.
 * Returns the payload, or null if the token is invalid, expired beyond the grace
 * window, or belongs to a session older than the absolute maximum.
 */
export function verifyAccessTokenWithGrace(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret, { ignoreExpiration: true });
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number') return null;
  if (nowSeconds() - payload.exp > config.jwt.refreshGraceSeconds) return null;
  if (sessionTooOld(payload)) return null;
  return payload;
}

/** Verifies the refresh cookie used by the standalone PinGGo front. */
export function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret);
    return sessionTooOld(payload) ? null : payload;
  } catch {
    return null;
  }
}
