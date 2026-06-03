import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import config from '../config/index.js';
import { authSocketMiddleware } from './middleware/authSocket.js';
import { registerMessageHandlers } from './handlers/messageHandlers.js';
import { registerPresenceHandlers } from './handlers/presenceHandlers.js';
import { setIO } from './io.js';

export function initSocket(httpServer, { client: pubClient, subscriber: subClient }) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.adapter(createAdapter(pubClient, subClient));
  setIO(io);
  io.use(authSocketMiddleware);

  io.on('connection', (socket) => {
    const { sub: uuid, username } = socket.data.user;
    console.log(`[socket] + ${username} (${socket.id})`);

    // Personal room for targeted DMs and notifications
    socket.join(`user:${uuid}`);

    registerMessageHandlers(io, socket);
    registerPresenceHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] - ${username} — ${reason}`);
    });
  });

  return io;
}
