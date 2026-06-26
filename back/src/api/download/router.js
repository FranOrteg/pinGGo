import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import {  } from '../../services/downloadService.js';

const router = Router();

router.get('/presign', authenticate, )

export default router;
