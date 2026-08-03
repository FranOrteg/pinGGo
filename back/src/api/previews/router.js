import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getLinkPreview } from '../../services/linkPreviewService.js';

const router = Router();

router.get('/resolve', authenticate, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });

    const preview = await getLinkPreview(url);
    res.json(preview);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

export default router;
