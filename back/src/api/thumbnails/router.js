import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getIO } from '../../socket/io.js';
import { getFileFromDatabase, assertChannelMembership } from '../../services/downloadService.js';
import { isOfficeType, getThumbnailUrl } from '../../services/thumbnailService.js';

const router = Router();

router.get('/presign', authenticate, async (req, res) => {
  try {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'uuid required' });

    const file = await getFileFromDatabase(uuid);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const hasAccess = await assertChannelMembership(file.channel_id, req.user.sub);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const supported =
      file.file_type === 'application/pdf' ||
      isOfficeType(file.file_type);

    if (!supported) {
      return res.status(404).json({ error: 'Thumbnail not available for this file type' });
    }

    const result = await getThumbnailUrl(uuid, {
      fileKey: file.file_key,
      fileType: file.file_type,
    });

    if (!result || !result.url) return res.status(404).json({ error: 'Could not generate thumbnail' });

    // Notify the whole channel so already-rendered messages pick up the
    // thumbnail the moment it becomes available (no reload / polling needed).
    // Rooms are keyed by the channel uuid (see channel:join in messageHandlers).
    if (result.generated) {
      const io = getIO();
      if (io) {
        io.to(`channel:${file.channel_uuid}`).emit('thumbnail:ready', {
          messageUuid: uuid,
          url: result.url,
        });
      }
    }

    res.json({ url: result.url });
  } catch (error) {
    console.error('[thumbnails] error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
