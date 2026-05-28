import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { searchUsers, getUserProfile, updateMyProfile } from '../../services/userService.js';

const router = Router();

router.use(authenticate);

router.get('/search', searchUsers);
router.patch('/me', updateMyProfile);
router.get('/:userId', getUserProfile);

export default router;
