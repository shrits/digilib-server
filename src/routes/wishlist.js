import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getWishlist, addToWishlist, removeFromWishlist } from '../controllers/wishlist.js';

const router = Router();

router.get('/users/me/wishlist', authenticate, getWishlist);
router.post('/users/me/wishlist/:bookId', authenticate, addToWishlist);
router.delete('/users/me/wishlist/:bookId', authenticate, removeFromWishlist);

export default router;
