import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getFileFromDatabase, createPresignedDownload } from '../../services/downloadService.js';

const router = Router();

router.get('/presign', authenticate, async (req, res) => {
    try {

        const { uuid, view } = req.query;

        const file = await createPresignedDownload(uuid, req.user.sub, { view: view === 'true' });
        
        res.json(file);
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

export default router;
