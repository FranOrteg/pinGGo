import jwt from 'jsonwebtoken';
import config from '../../config/index.js';

export function authSocketMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    socket.data.user = jwt.verify(token, config.jwt.accessSecret);
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
