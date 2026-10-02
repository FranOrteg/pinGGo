import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getIO } from '../../socket/io.js';
import { getFileFromDatabase, assertChannelMembership } from '../../services/downloadService.js';
import { getDocumentPreviewStatus } from '../../services/thumbnailService.js';
import { sendAssetStatus } from '../previewResponse.js';

const router = Router();

// PDF the in-app document viewer renders: the original PDF, or an Office file
// converted with LibreOffice (cached in S3 under previews/ after the first request).
router.get('/preview', authenticate, async (req, res) => {
  try {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'uuid required' });

    const file = await getFileFromDatabase(uuid);

    const hasAccess = await assertChannelMembership(file.channel_id, req.user.sub);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const result = await getDocumentPreviewStatus({ fileKey: file.file_key, fileType: file.file_type });

    // Clients waiting in the viewer re-request this endpoint for a fresh signed URL
    if (result.status === 'pending' && result.started) {
      const room = () => getIO()?.to(`channel:${file.channel_uuid}`);
      result.job.then(
        () => room()?.emit('document:ready', { messageUuid: uuid }),
        () => room()?.emit('document:failed', { messageUuid: uuid })
      );
    }

    sendAssetStatus(res, result);
  } catch (error) {
    if (error.message === 'File not found') return res.status(404).json({ error: error.message });
    console.error('[documents] preview error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
