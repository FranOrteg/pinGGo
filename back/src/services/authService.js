import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { query, queryOne } from '../db/pool.js';

function signTokens(payload) {
  const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
}

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
    const { accessToken, refreshToken } = signTokens({ sub: user.uuid, username: user.username });

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

    const { accessToken, refreshToken } = signTokens({ sub: user.uuid, username: user.username });
    setRefreshCookie(res, refreshToken);

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.refreshSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await queryOne('SELECT uuid, username FROM users WHERE uuid = ?', [payload.sub]);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const { accessToken, refreshToken } = signTokens({ sub: user.uuid, username: user.username });
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
