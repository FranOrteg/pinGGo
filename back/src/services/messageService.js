import { query, queryOne } from '../db/pool.js';

const MESSAGE_PROJECTION = `
  SELECT m.uuid, m.content, m.type, m.created_at, m.edited_at,
         u.uuid AS user_uuid, u.username, u.avatar_url,
         parent.uuid AS parent_uuid
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN messages parent ON parent.id = m.parent_id
`;

async function assertMembership(channelUuid, userUuid) {
  return queryOne(
    `SELECT c.id as channel_id FROM channels c
     JOIN channel_members cm ON cm.channel_id = c.id
     JOIN users u ON u.id = cm.user_id
     WHERE c.uuid = ? AND u.uuid = ?`,
    [channelUuid, userUuid]
  );
}

/** GET /channels/:channelId/messages — cursor-based pagination */
export async function getMessages(req, res, next) {
  try {
    const { channelId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before; // message uuid used as cursor

    const membership = await assertMembership(channelId, req.user.sub);
    if (!membership) return res.status(403).json({ error: 'Access denied' });

    let sql = `${MESSAGE_PROJECTION} WHERE m.channel_id = ? AND m.deleted_at IS NULL`;
    const params = [membership.channel_id];

    if (before) {
      const cursor = await queryOne('SELECT id FROM messages WHERE uuid = ?', [before]);
      if (cursor) {
        sql += ' AND m.id < ?';
        params.push(cursor.id);
      }
    }

    sql += ' ORDER BY m.id DESC LIMIT ?';
    params.push(limit);

    const messages = await query(sql, params);
    res.json({ messages: messages.reverse(), hasMore: messages.length === limit });
  } catch (err) {
    next(err);
  }
}

/** PATCH /messages/:messageId */
export async function editMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const msg = await queryOne(
      `SELECT m.id FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.uuid = ? AND u.uuid = ? AND m.deleted_at IS NULL`,
      [messageId, req.user.sub]
    );
    if (!msg) return res.status(404).json({ error: 'Message not found or not yours' });

    await query('UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?', [content, msg.id]);
    const updated = await queryOne(`${MESSAGE_PROJECTION} WHERE m.uuid = ?`, [messageId]);
    res.json({ message: updated });
  } catch (err) {
    next(err);
  }
}

/** DELETE /messages/:messageId — soft delete */
export async function deleteMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const msg = await queryOne(
      `SELECT m.id FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.uuid = ? AND u.uuid = ? AND m.deleted_at IS NULL`,
      [messageId, req.user.sub]
    );
    if (!msg) return res.status(404).json({ error: 'Message not found or not yours' });

    await query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [msg.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** POST /messages/:messageId/reactions */
export async function addReaction(req, res, next) {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    const msg = await queryOne('SELECT id FROM messages WHERE uuid = ?', [messageId]);
    const user = await queryOne('SELECT id FROM users WHERE uuid = ?', [req.user.sub]);
    if (!msg || !user) return res.status(404).json({ error: 'Not found' });

    await query(
      'INSERT IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
      [msg.id, user.id, emoji]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** DELETE /messages/:messageId/reactions/:emoji */
export async function removeReaction(req, res, next) {
  try {
    const { messageId, emoji } = req.params;
    const msg = await queryOne('SELECT id FROM messages WHERE uuid = ?', [messageId]);
    const user = await queryOne('SELECT id FROM users WHERE uuid = ?', [req.user.sub]);
    if (!msg || !user) return res.status(404).json({ error: 'Not found' });

    await query(
      'DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [msg.id, user.id, emoji]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
