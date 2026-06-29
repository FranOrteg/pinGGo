import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getFileFromDatabase, createPresignedDownload } from '../../services/downloadService.js';

const router = Router();

router.get('/presign', authenticate, async (req, res) => {
    try {

        const { uuid } = req.query;

        const file = await createPresignedDownload(uuid);
        
        res.json(file);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
