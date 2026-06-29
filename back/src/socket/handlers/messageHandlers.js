import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../../db/pool.js';

export function registerMessageHandlers(io, socket) {
  const { sub: userUuid, username } = socket.data.user;

  /** Join a channel room — verifies membership first */
  socket.on('channel:join', async ({ channelId }) => {
    const member = await queryOne(
      `SELECT 1 FROM channel_members cm
       JOIN channels c ON c.id = cm.channel_id
       JOIN users u ON u.id = cm.user_id
       WHERE c.uuid = ? AND u.uuid = ?`,
      [channelId, userUuid]
    ).catch(() => null);

    if (!member) return socket.emit('error', { message: 'Not a member of this channel' });
    socket.join(`channel:${channelId}`);
  });

  socket.on('channel:leave', ({ channelId }) => {
    socket.leave(`channel:${channelId}`);
  });

  /** Send a message — persists to DB then broadcasts to the channel room */
  socket.on('message:send', async ({
    channelId,
    content,
    type = 'text',
    parentId = null,
    fileKey = null,
    fileName = null,
    fileSize = null,
    fileType = null,
  }) => {
    try {
      const hasFile = !!(fileKey && fileName);
      if (!content?.trim() && !hasFile) return;

      const user = await queryOne('SELECT id FROM users WHERE uuid = ?', [userUuid]);
      const channel = await queryOne('SELECT id FROM channels WHERE uuid = ?', [channelId]);
      if (!user || !channel) return socket.emit('error', { message: 'Invalid channel' });

      const member = await queryOne(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [channel.id, user.id]
      );
      if (!member) return socket.emit('error', { message: 'Not a member' });

      let parentDbId = null;
      if (parentId) {
        const parent = await queryOne('SELECT id FROM messages WHERE uuid = ?', [parentId]);
        parentDbId = parent?.id ?? null;
      }

      const resolvedType = hasFile ? 'file' : type;
      const uuid = uuidv4();
      const fileKeyToSave = fileKey;

      await query(
        `INSERT INTO messages
          (uuid, channel_id, user_id, content, type, parent_id,
          file_key, file_name, file_size, file_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          channel.id,
          user.id,
          content?.trim() || null,
          resolvedType,
          parentDbId,
          fileKeyToSave,
          fileName,
          fileSize ? Number(fileSize) : null,
          fileType
        ]
      );

      const message = await queryOne(
        `SELECT m.uuid, m.content, m.type, m.created_at,
                m.file_name, m.file_size, m.file_type, m.file_key,
                u.uuid AS user_uuid, u.username, u.avatar_url,
                parent.uuid AS parent_uuid
         FROM messages m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN messages parent ON parent.id = m.parent_id
         WHERE m.uuid = ?`,
        [uuid]
      );

      io.to(`channel:${channelId}`).emit('message:new', { channelId, message: { ...message, reactions: [] } });
    } catch (err) {
      console.error('[socket] message:send error:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  /** Typing indicators — relayed only to others in the channel */
  socket.on('typing:start', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('typing:start', {
      channelId,
      username: socket.data.user.username,
    });
  });

  socket.on('typing:stop', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('typing:stop', {
      channelId,
      username: socket.data.user.username,
    });
  });
}
