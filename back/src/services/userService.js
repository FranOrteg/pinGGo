import { query, queryOne } from '../db/pool.js';

export async function searchUsers(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 chars' });

    const users = await query(
      `SELECT uuid, username, avatar_url, status
       FROM users
       WHERE username LIKE ? AND uuid != ?
       LIMIT 20`,
      [`%${q}%`, req.user.sub]
    );
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function getUserProfile(req, res, next) {
  try {
    const { userId } = req.params;
    const user = await queryOne(
      'SELECT uuid, username, avatar_url, status, last_seen FROM users WHERE uuid = ?',
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateMyProfile(req, res, next) {
  try {
    const { username, avatarUrl } = req.body;
    const fields = [];
    const params = [];

    if (username) { fields.push('username = ?'); params.push(username); }
    if (avatarUrl) { fields.push('avatar_url = ?'); params.push(avatarUrl); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.user.sub);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE uuid = ?`, params);

    const user = await queryOne(
      'SELECT uuid, username, email, avatar_url, status FROM users WHERE uuid = ?',
      [req.user.sub]
    );
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
