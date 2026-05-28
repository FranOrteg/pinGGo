import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { editMessage, deleteMessage, addReaction, removeReaction } from '../../services/messageService.js';

const router = Router();

router.use(authenticate);

router.patch('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/reactions', addReaction);
router.delete('/:messageId/reactions/:emoji', removeReaction);

export default router;
