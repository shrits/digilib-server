import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getAnalytics, listUsers, updateUser, listAllReviews } from '../controllers/admin.js';

const router = Router();

// All admin routes require admin role
router.use(authenticate, requireRole('ADMIN'));

router.get('/analytics', getAnalytics);
router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.get('/reviews', listAllReviews);

export default router;
