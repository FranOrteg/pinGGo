import { query } from '../../db/pool.js';
import { getRedis } from '../../redis/client.js';

const PRESENCE_TTL_SECONDS = 35; // slightly above the 25s heartbeat interval

export function registerPresenceHandlers(io, socket) {
  const { uuid: userUuid, username } = socket.data.user;
  const presenceKey = `presence:${userUuid}`;

  async function setStatus(status) {
    const redis = getRedis();
    if (status === 'offline') {
      await redis.del(presenceKey);
    } else {
      await redis.setex(presenceKey, PRESENCE_TTL_SECONDS, status);
    }
    await query('UPDATE users SET status = ?, last_seen = NOW() WHERE uuid = ?', [status, userUuid]);
    io.emit('presence:change', { userUuid, username, status });
  }

  // Mark online on connect
  setStatus('online').catch(console.error);

  /** Client sends a heartbeat every ~25s to keep the TTL alive */
  socket.on('presence:heartbeat', () => {
    getRedis().expire(presenceKey, PRESENCE_TTL_SECONDS).catch(console.error);
  });

  /** Client can change own status manually (away, dnd) */
  socket.on('presence:set', async ({ status }) => {
    const allowed = ['online', 'away', 'dnd'];
    if (!allowed.includes(status)) return;
    setStatus(status).catch(console.error);
  });

  socket.on('disconnect', () => {
    setStatus('offline').catch(console.error);
  });
}
