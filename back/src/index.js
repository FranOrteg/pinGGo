import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';

import config from './config/index.js';
import { connectDB } from './db/pool.js';
import { connectRedis } from './redis/client.js';
import apiRouter from './api/index.js';
import { initSocket } from './socket/index.js';
import { errorHandler, mirrorErrorMessage } from './middleware/errorHandler.js';

if (config.nodeEnv === 'production' && !config.labit.validateUrl) {
  console.error('[server] LABIT_VALIDATE_URL is required in production (Skylab token validation)');
  process.exit(1);
}
if (config.nodeEnv === 'production' && config.jwt.accessSecret.startsWith('dev_')) {
  console.error('[server] JWT_ACCESS_SECRET must be set in production');
  process.exit(1);
}

const app = express();
const httpServer = createServer(app);

// Behind Nginx: use X-Forwarded-For so rate limiting is per client, not per proxy
app.set('trust proxy', 1);

app.use(mirrorErrorMessage);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

app.use('/api', apiRouter);
app.use(errorHandler);

async function bootstrap() {
  await connectDB();
  const redisClients = await connectRedis();
  initSocket(httpServer, redisClients);

  httpServer.listen(config.port, () => {
    console.log(`[server] Running on port ${config.port} (${config.nodeEnv})`);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
