import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { listGenres, createGenre, updateGenre, deleteGenre } from '../controllers/genres.js';

const router = Router();

router.get('/', authenticate, listGenres);
router.post('/', authenticate, requireRole('ADMIN'), createGenre);
router.put('/:id', authenticate, requireRole('ADMIN'), updateGenre);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteGenre);

export default router;
