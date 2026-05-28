import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import {
  getMyChannels,
  createChannel,
  getChannel,
  addMember,
  leaveChannel,
} from '../../services/channelService.js';
import { getMessages } from '../../services/messageService.js';

const router = Router();

router.use(authenticate);

router.get('/', getMyChannels);
router.post('/', createChannel);
router.get('/:channelId', getChannel);
router.delete('/:channelId/members/me', leaveChannel);
router.post('/:channelId/members', addMember);
router.get('/:channelId/messages', getMessages);

export default router;
