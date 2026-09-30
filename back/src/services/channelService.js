import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/pool.js';
import { getIO } from '../socket/io.js';
import { deleteS3Objects } from './uploadService.js';
import { getThumbnailKey } from './thumbnailService.js';

// Only these channel types have a curated member list (public channels include everyone,
// DMs are fixed to their two participants).
const MANAGED_TYPES = new Set(['private', 'group']);

/**
 * SQL subquery for a column of the DM peer of user `u` in channel `c`. Prefers the other
 * participant; in a self-DM (the user is the only member) it resolves to the user itself.
 */
const dmPeer = (column) =>
  `(SELECT u2.${column} FROM channel_members cm2
    JOIN users u2 ON u2.id = cm2.user_id
    WHERE cm2.channel_id = c.id
    ORDER BY (cm2.user_id = u.id) ASC
    LIMIT 1)`;

/** A self-DM is a direct channel whose only member is its owner (Slack-style notes to self). */
const IS_SELF_DM = `(c.type = 'direct'
  AND (SELECT COUNT(*) FROM channel_members cm3 WHERE cm3.channel_id = c.id) = 1)`;

/** Same shape `channel:created` already carries, so clients reuse their handler. */
async function getChannelSummary(channelId) {
  const channel = await queryOne(
    'SELECT uuid, name, description, type, is_private FROM channels WHERE id = ?',
    [channelId]
  );
  return channel && { ...channel, dm_user_uuid: null, dm_avatar_url: null };
}

/** Membership row of the requester for a channel, or null. */
function getRequesterMembership(channelUuid, userUuid) {
  return queryOne(
    `SELECT c.id AS channelId, c.type, u.id AS userId, cm.role
     FROM channels c
     JOIN channel_members cm ON cm.channel_id = c.id
     JOIN users u ON u.id = cm.user_id
     WHERE c.uuid = ? AND u.uuid = ?`,
    [channelUuid, userUuid]
  );
}

/** Drops every socket of a user from a channel room so they stop receiving its events. */
function kickFromChannelRoom(io, userUuid, channelUuid) {
  io.in(`user:${userUuid}`).socketsLeave(`channel:${channelUuid}`);
}

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
              CASE WHEN c.type = 'direct' THEN ${dmPeer('username')} ELSE c.name END AS name,
              CASE WHEN c.type = 'direct' THEN ${dmPeer('uuid')} END AS dm_user_uuid,
              CASE WHEN c.type = 'direct' THEN ${dmPeer('avatar_url')} END AS dm_avatar_url,
              CASE WHEN c.type = 'direct' THEN ${dmPeer('status')} END AS dm_status,
              ${IS_SELF_DM} AS is_self_dm,
              c.type, c.description, c.is_private, c.created_at,
              (SELECT COUNT(*) FROM messages m
               WHERE m.channel_id = c.id
                 AND m.deleted_at IS NULL
                 AND m.user_id != cm.user_id
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

    // Public channels include every workspace user. Backfill membership here as
    // well so the member list remains complete even for users created later.
    await query(
      `INSERT IGNORE INTO channel_members (channel_id, user_id)
       SELECT c.id, u.id FROM channels c
       JOIN users u
       WHERE c.uuid = ? AND c.type = 'channel'`,
      [channelId]
    );

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

    // For DMs: reuse the existing direct channel instead of creating a duplicate.
    // A self-DM (memberUuids = [own uuid]) is the direct channel where the user is alone.
    if (type === 'direct' && memberUuids.length === 1) {
      const isSelfDm = memberUuids[0] === req.user.sub;
      const existing = isSelfDm
        ? await queryOne(
          `SELECT c.uuid FROM channels c
           JOIN channel_members cm ON cm.channel_id = c.id
           JOIN users u ON u.id = cm.user_id AND u.uuid = ?
           WHERE ${IS_SELF_DM}
           LIMIT 1`,
          [req.user.sub]
        )
        : await queryOne(
          `SELECT c.uuid FROM channels c
           JOIN channel_members cm1 ON cm1.channel_id = c.id
           JOIN users u1 ON u1.id = cm1.user_id AND u1.uuid = ?
           JOIN channel_members cm2 ON cm2.channel_id = c.id
           JOIN users u2 ON u2.id = cm2.user_id AND u2.uuid = ?
           WHERE c.type = 'direct' AND u1.id != u2.id
           LIMIT 1`,
          [req.user.sub, memberUuids[0]]
        );
      if (existing) {
        const ch = await queryOne(
          `SELECT c.uuid, c.type, c.is_private, c.description,
                  ${dmPeer('username')} AS name,
                  ${dmPeer('uuid')} AS dm_user_uuid,
                  ${dmPeer('avatar_url')} AS dm_avatar_url,
                  ${IS_SELF_DM} AS is_self_dm
           FROM channels c
           JOIN users u ON u.uuid = ?
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

    let otherMember = null;
    let isSelfDm = false;
    if (isDirect) {
      // Other participant first; a self-DM has none, so it falls back to the creator.
      otherMember = await queryOne(
        `SELECT u.uuid, u.username, u.avatar_url FROM channel_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.channel_id = ?
         ORDER BY (u.uuid = ?) ASC
         LIMIT 1`,
        [channel.id, req.user.sub]
      );
      isSelfDm = type === 'direct' && otherMember?.uuid === req.user.sub;
    }

    const responseChannel = {
      uuid: channel.uuid,
      name: isDirect ? (otherMember?.username ?? null) : channelName,
      description,
      type: finalType,
      is_private: isPrivateFinal ? 1 : 0,
      dm_user_uuid: type === 'direct' ? (otherMember?.uuid ?? null) : null,
      dm_avatar_url: type === 'direct' ? (otherMember?.avatar_url ?? null) : null,
      is_self_dm: isSelfDm ? 1 : 0,
    };

    const io = getIO();
    if (io) {
      if (finalType === 'channel') {
        // Public channel: everyone is a member, broadcast to all connected clients.
        io.emit('channel:created', { channel: responseChannel });
      } else {
        // Private/group/DM: notify only the personal rooms of its members (creator included).
        const memberRows = await query(
          `SELECT u.uuid FROM channel_members cm
           JOIN users u ON u.id = cm.user_id
           WHERE cm.channel_id = ?`,
          [channel.id]
        );
        for (const { uuid: memberUuid } of memberRows) {
          io.to(`user:${memberUuid}`).emit('channel:created', { channel: responseChannel });
        }
      }
    }

    res.status(201).json({ channel: responseChannel });
  } catch (err) {
    next(err);
  }
}

export async function addMember(req, res, next) {
  try {
    const { channelId } = req.params;
    const { userUuid } = req.body;
    if (!userUuid) return res.status(400).json({ error: 'userUuid is required' });

    const requester = await getRequesterMembership(channelId, req.user.sub);
    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!MANAGED_TYPES.has(requester.type)) {
      return res.status(400).json({ error: 'Members can only be added to private channels or groups' });
    }

    const member = await queryOne(
      'SELECT id, uuid, username, avatar_url, status FROM users WHERE uuid = ?',
      [userUuid]
    );
    if (!member) return res.status(404).json({ error: 'User not found' });

    const result = await query(
      'INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)',
      [requester.channelId, member.id]
    );
    const { id: _id, ...publicMember } = member;
    const memberDto = { ...publicMember, role: 'member' };

    // Already a member: nothing changed, so don't re-notify anyone
    if (result.affectedRows === 0) return res.json({ member: memberDto });

    const io = getIO();
    if (io) {
      const channel = await getChannelSummary(requester.channelId);
      io.to(`user:${member.uuid}`).emit('channel:created', { channel });
      io.to(`channel:${channelId}`).emit('channel:member_added', { channelId, member: memberDto });
    }

    res.status(201).json({ member: memberDto });
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req, res, next) {
  try {
    const { channelId, userUuid } = req.params;
    if (userUuid === req.user.sub) {
      return res.status(400).json({ error: 'Use DELETE /members/me to leave a channel' });
    }

    const requester = await getRequesterMembership(channelId, req.user.sub);
    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!MANAGED_TYPES.has(requester.type)) {
      return res.status(400).json({ error: 'Members can only be removed from private channels or groups' });
    }

    const target = await getRequesterMembership(channelId, userUuid);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: 'The channel owner cannot be removed' });
    }
    if (target.role === 'admin' && requester.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can remove an admin' });
    }

    await query(
      'DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?',
      [requester.channelId, target.userId]
    );

    const io = getIO();
    if (io) {
      kickFromChannelRoom(io, userUuid, channelId);
      io.to(`user:${userUuid}`).emit('channel:removed', { channelId });
      io.to(`channel:${channelId}`).emit('channel:member_removed', { channelId, userUuid });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteChannel(req, res, next) {
  try {
    const { channelId } = req.params;

    const requester = await getRequesterMembership(channelId, req.user.sub);
    if (!requester || requester.role !== 'owner') {
      return res.status(403).json({ error: 'Only the channel owner can delete it' });
    }
    if (requester.type === 'direct') {
      return res.status(400).json({ error: 'Direct messages cannot be deleted' });
    }

    // Collect what we need before the cascade removes it
    const memberRows = await query(
      `SELECT u.uuid FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ?`,
      [requester.channelId]
    );
    const fileRows = await query(
      'SELECT file_key FROM messages WHERE channel_id = ? AND file_key IS NOT NULL',
      [requester.channelId]
    );

    // ON DELETE CASCADE removes members, messages, reactions and attachments
    await query('DELETE FROM channels WHERE id = ?', [requester.channelId]);

    const io = getIO();
    if (io) {
      if (requester.type === 'channel') {
        io.emit('channel:deleted', { channelId });
      } else {
        for (const { uuid } of memberRows) {
          io.to(`user:${uuid}`).emit('channel:deleted', { channelId });
        }
      }
      io.in(`channel:${channelId}`).socketsLeave(`channel:${channelId}`);
    }

    res.json({ ok: true });

    // Best-effort S3 cleanup (attachments + generated thumbnails), off the request path
    const keys = fileRows.flatMap(({ file_key: key }) => [key, getThumbnailKey(key)]);
    deleteS3Objects(keys).catch((err) =>
      console.error(`[channels] S3 cleanup failed for channel ${channelId}:`, err)
    );
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
    const membership = await getRequesterMembership(channelId, req.user.sub);
    if (!membership) return res.status(404).json({ error: 'Not found' });

    // Public channels are backfilled for everyone, so leaving would not stick
    if (membership.type === 'channel') {
      return res.status(400).json({ error: 'Public channels include everyone' });
    }
    if (membership.role === 'owner') {
      return res.status(400).json({ error: 'Owner must delete the channel' });
    }

    await query(
      'DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?',
      [membership.channelId, membership.userId]
    );

    const io = getIO();
    if (io) {
      kickFromChannelRoom(io, req.user.sub, channelId);
      io.to(`channel:${channelId}`).emit('channel:member_removed', {
        channelId,
        userUuid: req.user.sub,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
