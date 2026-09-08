import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getMyProgress, updateProgress } from '../controllers/progress.js';

const router = Router();

router.get('/users/me/progress', authenticate, getMyProgress);
router.put('/books/:id/progress', authenticate, updateProgress);

export default router;
