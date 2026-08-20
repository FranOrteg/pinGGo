import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { register, login, refresh, logout, me, exchangeToken } from '../../services/authService.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/exchange-token', exchangeToken);
router.get('/me', authenticate, me);

export default router;
