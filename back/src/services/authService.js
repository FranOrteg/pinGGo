import bcrypt from 'bcryptjs';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import config from '../config/index.js';
import { query, queryOne } from '../db/pool.js';
import {
  buildPayload,
  signTokens,
  verifyAccessTokenWithGrace,
  verifyRefreshToken,
} from './tokenService.js';
import { isLabitValidationConfigured, resolveLabitContactId } from './labitService.js';

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    // 'lax' allows same-site cross-port fetches (localhost:5173 → localhost:4000 in dev)
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

export async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email and password are required' });
    }

    const existing = await queryOne(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing) return res.status(409).json({ error: 'Email or username already taken' });

    const passwordHash = await bcrypt.hash(password, 12);
    const uuid = uuidv4();
    await query(
      'INSERT INTO users (uuid, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [uuid, username, email, passwordHash]
    );

    const user = await queryOne(
      'SELECT id, uuid, username, email FROM users WHERE uuid = ?',
      [uuid]
    );
    const { accessToken, refreshToken } = signTokens(buildPayload(user));

    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await queryOne(
      'SELECT id, uuid, username, email, avatar_url, status, password_hash FROM users WHERE email = ?',
      [email]
    );
    // Use a constant-time check even on "not found" to avoid user enumeration
    const dummyHash = '$2a$12$invaliddummyhashtopreventtimingattacks000000000000000000';
    const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { accessToken, refreshToken } = signTokens(buildPayload(user));
    setRefreshCookie(res, refreshToken);

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, accessToken });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Two ways to prove the session, in this order:
 *  1. Authorization: Bearer <access token> — the Skylab front sends its current token,
 *     usually already expired. Signature is checked, expiry is tolerated within
 *     JWT_REFRESH_GRACE_SECONDS, and the session cannot exceed SESSION_MAX_AGE_SECONDS.
 *  2. refresh_token httpOnly cookie — standalone PinGGo front.
 */
export async function refresh(req, res, next) {
  try {
    const header = req.headers.authorization;
    let payload = null;

    if (header?.startsWith('Bearer ')) {
      payload = verifyAccessTokenWithGrace(header.slice(7));
    } else if (req.cookies?.refresh_token) {
      payload = verifyRefreshToken(req.cookies.refresh_token);
    }

    if (!payload?.sub) return res.status(401).json({ error: 'Session expired' });

    const user = await queryOne('SELECT uuid, username, email FROM users WHERE uuid = ?', [payload.sub]);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Keep the original session auth time so refreshes cannot extend a session forever
    const { accessToken, refreshToken } = signTokens(buildPayload(user, payload.sat));
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.json({ ok: true });
}

export async function me(req, res, next) {
  try {
    const user = await queryOne(
      'SELECT id, uuid, username, email, avatar_url, status, last_seen, created_at FROM users WHERE uuid = ?',
      [req.user.sub]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// UUID v5 namespace (must match the Skylab front: uuidv5(email, NAMESPACE))
const SKYLAB_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * POST /api/auth/exchange-token
 * Body: { skylabId, email, username, avatarUrl?, skylabToken }
 * skylabToken is the opaque Labit session token; it is validated server-to-server
 * against Labit and must resolve to the same contact id as skylabId.
 * Response: { accessToken, user }
 */
export async function exchangeToken(req, res, next) {
  try {
    const { email, username, avatarUrl } = req.body ?? {};
    const skylabId = req.body?.skylabId != null ? String(req.body.skylabId).trim() : '';
    let skylabToken = typeof req.body?.skylabToken === 'string' ? req.body.skylabToken.trim() : '';
    if (skylabToken.toLowerCase().startsWith('bearer ')) skylabToken = skylabToken.slice(7).trim();

    if (!skylabId || !email || !username || !skylabToken) {
      return res.status(400).json({
        error: 'skylabId, email, username and skylabToken are required',
      });
    }
    if (!/^\d+$/.test(skylabId)) {
      return res.status(400).json({ error: 'skylabId must be a numeric Labit contact id' });
    }

    if (isLabitValidationConfigured()) {
      const contactId = await resolveLabitContactId(skylabToken); // throws 502 if Labit is down
      if (!contactId || contactId !== skylabId) {
        console.warn(`[auth] exchange rejected: Labit contact ${contactId ?? 'none'} ≠ skylabId ${skylabId} (${email})`);
        return res.status(401).json({ error: 'Invalid Skylab token' });
      }
    } else {
      // Only reachable outside production (startup fails without LABIT_VALIDATE_URL there)
      console.warn('[auth] LABIT_VALIDATE_URL not set — skipping Skylab token validation');
    }

    // Deterministic UUID v5 from the email exactly as received (the front does the same)
    const uuid = uuidv5(email, SKYLAB_NAMESPACE);
    const cleanUsername = String(username).trim().slice(0, 100);

    let user = await queryOne(
      'SELECT id, uuid, username, email, avatar_url, skylab_id FROM users WHERE uuid = ?',
      [uuid]
    );

    if (!user) {
      await query(
        'INSERT INTO users (uuid, username, email, password_hash, skylab_id, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid, cleanUsername, email, '', skylabId, avatarUrl || null]
      );
    } else {
      // Never overwrite username/avatar the user may have edited inside PinGGo:
      // only fill in what is missing.
      const updates = [];
      const params = [];
      if (!user.avatar_url && avatarUrl) { updates.push('avatar_url = ?'); params.push(avatarUrl); }
      if (user.skylab_id == null) { updates.push('skylab_id = ?'); params.push(skylabId); }
      if (updates.length) {
        params.push(uuid);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE uuid = ?`, params);
      }
    }

    user = await queryOne(
      'SELECT id, uuid, username, email, avatar_url FROM users WHERE uuid = ?',
      [uuid]
    );

    const { accessToken, refreshToken } = signTokens(buildPayload(user));
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}
