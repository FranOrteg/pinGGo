import { verifyAccessToken } from '../services/tokenService.js';

export function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    // 401 makes the Skylab front call POST /api/auth/refresh and retry once
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.access_token ?? null;
}
