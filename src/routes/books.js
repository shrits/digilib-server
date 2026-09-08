import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadBookFiles } from '../middleware/upload.js';
import {
  listBooks,
  getBook,
  createBook,
  updateBook,
  deleteBook,
  metadataLookup,
  readBook,
  downloadBook,
  getFeaturedBooks,
} from '../controllers/books.js';

const router = Router();

// Public-ish routes (still require auth per DPR)
router.get('/', authenticate, listBooks);
router.get('/featured', authenticate, getFeaturedBooks);
router.get('/metadata-lookup', authenticate, requireRole('ADMIN'), metadataLookup);
router.get('/:id', authenticate, getBook);
router.get('/:id/read', authenticate, readBook);
router.get('/:id/download', authenticate, downloadBook);

// Admin routes
router.post('/', authenticate, requireRole('ADMIN'), uploadBookFiles, createBook);
router.put('/:id', authenticate, requireRole('ADMIN'), uploadBookFiles, updateBook);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteBook);

export default router;
