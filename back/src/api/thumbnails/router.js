import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getIO } from '../../socket/io.js';
import { getFileFromDatabase, assertChannelMembership } from '../../services/downloadService.js';
import { getThumbnailStatus } from '../../services/thumbnailService.js';
import { sendAssetStatus } from '../previewResponse.js';

const router = Router();

router.get('/presign', authenticate, async (req, res) => {
  try {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'uuid required' });

    const file = await getFileFromDatabase(uuid);

    const hasAccess = await assertChannelMembership(file.channel_id, req.user.sub);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const result = await getThumbnailStatus({ fileKey: file.file_key, fileType: file.file_type });

    // Generation runs in the background; the whole channel is told when it's done so
    // already-rendered messages update without reload or polling. Rooms are keyed by
    // the channel uuid (see channel:join in messageHandlers).
    if (result.status === 'pending' && result.started) {
      const room = () => getIO()?.to(`channel:${file.channel_uuid}`);
      result.job.then(
        ({ url }) => room()?.emit('thumbnail:ready', { messageUuid: uuid, url }),
        () => room()?.emit('thumbnail:failed', { messageUuid: uuid })
      );
    }

    sendAssetStatus(res, result);
  } catch (error) {
    if (error.message === 'File not found') return res.status(404).json({ error: error.message });
    console.error('[thumbnails] error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
