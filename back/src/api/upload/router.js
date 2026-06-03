import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { createPresignedUpload } from '../../services/uploadService.js';

const router = Router();

router.post('/presign', authenticate, createPresignedUpload);

export default router;
