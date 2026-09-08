import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listBookmarks, createBookmark, deleteBookmark } from '../controllers/bookmarks.js';

const router = Router();

router.get('/books/:id/bookmarks', authenticate, listBookmarks);
router.post('/books/:id/bookmarks', authenticate, createBookmark);
router.delete('/bookmarks/:id', authenticate, deleteBookmark);

export default router;
