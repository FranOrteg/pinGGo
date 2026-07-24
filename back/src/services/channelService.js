import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/pool.js';

export async function getMyChannels(req, res, next) {
  try {
    // Self-heal: public channels are open to every user. Backfill any membership rows
    // the current user is still missing (e.g. channels created before they registered,
    // or before this user was ever added) so visibility/access stays driven by
    // channel_members without needing to touch every other endpoint.
    await query(
      `INSERT IGNORE INTO channel_members (channel_id, user_id)
       SELECT c.id, u.id FROM channels c
       JOIN users u ON u.uuid = ?
       WHERE c.type = 'channel'`,
      [req.user.sub]
    );

    const channels = await query(
      `SELECT c.uuid,
              CASE WHEN c.type = 'direct'
                   THEN (SELECT u2.username FROM channel_members cm2
                         JOIN users u2 ON u2.id = cm2.user_id
                         WHERE cm2.channel_id = c.id AND cm2.user_id != u.id
                         LIMIT 1)
                   ELSE c.name
              END AS name,
              c.type, c.description, c.is_private, c.created_at,
              (SELECT COUNT(*) FROM messages m
               WHERE m.channel_id = c.id
                 AND m.deleted_at IS NULL
                 AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
              ) AS unread_count
       FROM channels c
       JOIN channel_members cm ON cm.channel_id = c.id
       JOIN users u ON u.id = cm.user_id
       WHERE u.uuid = ?
       ORDER BY c.created_at DESC`,
      [req.user.sub]
    );
    res.json({ channels });
  } catch (err) {
    next(err);
  }
}

export async function getChannel(req, res, next) {
  try {
    const { channelId } = req.params;
    const channel = await queryOne(
      `SELECT c.uuid, c.name, c.type, c.is_private, c.created_at
       FROM channels c
       JOIN channel_members cm ON cm.channel_id = c.id
       JOIN users u ON u.id = cm.user_id
       WHERE c.uuid = ? AND u.uuid = ?`,
      [channelId, req.user.sub]
    );
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const members = await query(
      `SELECT u.uuid, u.username, u.avatar_url, u.status, cm.role
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = (SELECT id FROM channels WHERE uuid = ?)`,
      [channelId]
    );
    res.json({ channel: { ...channel, members } });
  } catch (err) {
    next(err);
  }
}

export async function createChannel(req, res, next) {
  try {
    const { name, description = '', type = 'channel', isPrivate = false, memberUuids = [] } = req.body;

    const isDirect = type === 'direct' || type === 'group';
    if (!isDirect && !name) return res.status(400).json({ error: 'name is required' });

    // A channel is private when explicitly flagged or when type is 'private'.
    // Public channels (type 'channel') are open to every user in the workspace.
    const isPrivateFinal = !isDirect && (isPrivate === true || type === 'private');
    const finalType = isDirect ? type : (isPrivateFinal ? 'private' : 'channel');

    const creator = await queryOne('SELECT id FROM users WHERE uuid = ?', [req.user.sub]);
    if (!creator) return res.status(404).json({ error: 'User not found' });

    // For DMs: check if a direct channel already exists between these two users to avoid duplicates
    if (type === 'direct' && memberUuids.length === 1) {
      const existing = await queryOne(
        `SELECT c.uuid FROM channels c
         JOIN channel_members cm1 ON cm1.channel_id = c.id
         JOIN users u1 ON u1.id = cm1.user_id AND u1.uuid = ?
         JOIN channel_members cm2 ON cm2.channel_id = c.id
         JOIN users u2 ON u2.id = cm2.user_id AND u2.uuid = ?
         WHERE c.type = 'direct'
         LIMIT 1`,
        [req.user.sub, memberUuids[0]]
      );
      if (existing) {
        const ch = await queryOne(
          `SELECT c.uuid, c.type, c.is_private, c.description,
                  CASE WHEN c.type = 'direct'
                       THEN (SELECT u2.username FROM channel_members cm2
                             JOIN users u2 ON u2.id = cm2.user_id
                             WHERE cm2.channel_id = c.id AND cm2.user_id != ?
                             LIMIT 1)
                       ELSE c.name
                  END AS name
           FROM channels c
           WHERE c.uuid = ?`,
          [req.user.sub, existing.uuid]
        );
        return res.json({ channel: ch });
      }
    }

    const channelName = isDirect ? null : name;
    const uuid = uuidv4();
    await query(
      'INSERT INTO channels (uuid, name, description, type, is_private, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid, channelName, description, finalType, isPrivateFinal ? 1 : 0, creator.id]
    );
    const channel = await queryOne('SELECT id, uuid FROM channels WHERE uuid = ?', [uuid]);

    await query(
      'INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)',
      [channel.id, creator.id, 'owner']
    );

    for (const memberUuid of memberUuids) {
      const member = await queryOne('SELECT id FROM users WHERE uuid = ?', [memberUuid]);
      if (member) {
        await query(
          'INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)',
          [channel.id, member.id]
        );
      }
    }

    // Public channels are for everyone: every existing user becomes a member automatically
    // (new users are backfilled lazily in getMyChannels). This keeps channel_members as the
    // single source of truth for visibility, messaging and attachment authorization.
    if (finalType === 'channel') {
      await query(
        `INSERT IGNORE INTO channel_members (channel_id, user_id, role)
         SELECT ?, id, 'member' FROM users WHERE id != ?`,
        [channel.id, creator.id]
      );
    }

    res.status(201).json({
      channel: {
        uuid: channel.uuid,
        name: isDirect ? (memberUuids[0] ? (await queryOne(
          `SELECT u.username FROM channel_members cm
           JOIN users u ON u.id = cm.user_id
           WHERE cm.channel_id = ? AND u.uuid != ?`,
          [channel.id, req.user.sub]
        ))?.username ?? null : null) : channelName,
        description,
        type: finalType,
        is_private: isPrivateFinal ? 1 : 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function addMember(req, res, next) {
  try {
    const { channelId } = req.params;
    const { userUuid } = req.body;
    if (!userUuid) return res.status(400).json({ error: 'userUuid is required' });

    const channel = await queryOne(
      `SELECT c.id FROM channels c
       JOIN channel_members cm ON cm.channel_id = c.id
       JOIN users u ON u.id = cm.user_id
       WHERE c.uuid = ? AND u.uuid = ? AND cm.role IN ('owner','admin')`,
      [channelId, req.user.sub]
    );
    if (!channel) return res.status(403).json({ error: 'Forbidden' });

    const newMember = await queryOne('SELECT id FROM users WHERE uuid = ?', [userUuid]);
    if (!newMember) return res.status(404).json({ error: 'User not found' });

    await query(
      'INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)',
      [channel.id, newMember.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function markChannelRead(req, res, next) {
  try {
    const { channelId } = req.params;
    await query(
      `UPDATE channel_members cm
       JOIN channels c ON c.id = cm.channel_id
       JOIN users u ON u.id = cm.user_id
       SET cm.last_read_at = NOW()
       WHERE c.uuid = ? AND u.uuid = ?`,
      [channelId, req.user.sub]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function leaveChannel(req, res, next) {
  try {
    const { channelId } = req.params;
    const user = await queryOne('SELECT id FROM users WHERE uuid = ?', [req.user.sub]);
    const channel = await queryOne('SELECT id FROM channels WHERE uuid = ?', [channelId]);
    if (!user || !channel) return res.status(404).json({ error: 'Not found' });

    await query(
      'DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?',
      [channel.id, user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
