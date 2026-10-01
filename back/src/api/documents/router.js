import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getFileFromDatabase, assertChannelMembership } from '../../services/downloadService.js';
import { isOfficeType, getDocumentPreviewUrl } from '../../services/thumbnailService.js';

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

    if (file.file_type !== 'application/pdf' && !isOfficeType(file.file_type)) {
      return res.status(415).json({ error: 'Preview not available for this file type' });
    }

    const url = await getDocumentPreviewUrl({ fileKey: file.file_key, fileType: file.file_type });
    if (!url) return res.status(404).json({ error: 'Could not generate preview' });

    res.json({ url });
  } catch (error) {
    if (error.message === 'File not found') return res.status(404).json({ error: error.message });
    console.error('[documents] preview error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
