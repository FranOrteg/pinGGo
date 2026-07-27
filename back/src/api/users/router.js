import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { searchUsers, getUserProfile, updateMyProfile } from '../../services/userService.js';
import { createPresignedAvatarDownload, createPresignedAvatarUpload } from '../../services/avatarService.js';

const router = Router();

router.use(authenticate);

router.get('/search', searchUsers);
router.post('/me/avatar/presign', createPresignedAvatarUpload);
router.patch('/me', updateMyProfile);
router.get('/:userId/avatar/presign', createPresignedAvatarDownload);
router.get('/:userId', getUserProfile);

export default router;
