import { Router } from 'express';
import authRouter from './auth/router.js';
import usersRouter from './users/router.js';
import channelsRouter from './channels/router.js';
import messagesRouter from './messages/router.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/channels', channelsRouter);
router.use('/messages', messagesRouter);

export default router;
