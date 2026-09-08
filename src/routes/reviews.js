import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listReviews, createReview, updateReview, deleteReview } from '../controllers/reviews.js';

const router = Router();

router.get('/books/:id/reviews', authenticate, listReviews);
router.post('/books/:id/reviews', authenticate, createReview);
router.put('/reviews/:id', authenticate, updateReview);
router.delete('/reviews/:id', authenticate, deleteReview);

export default router;
