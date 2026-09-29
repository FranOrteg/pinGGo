import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import {
  getMyChannels,
  createChannel,
  getChannel,
  addMember,
  removeMember,
  deleteChannel,
  leaveChannel,
  markChannelRead,
} from '../../services/channelService.js';
import { getMessages } from '../../services/messageService.js';

const router = Router();

router.use(authenticate);

router.get('/', getMyChannels);
router.post('/', createChannel);
router.get('/:channelId', getChannel);
router.delete('/:channelId', deleteChannel);
router.post('/:channelId/read', markChannelRead);
router.delete('/:channelId/members/me', leaveChannel);
router.post('/:channelId/members', addMember);
// Must stay after /members/me so "me" is not captured as a userUuid
router.delete('/:channelId/members/:userUuid', removeMember);
router.get('/:channelId/messages', getMessages);

export default router;
