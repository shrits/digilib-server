import prisma from '../config/db.js';
import { validate, reviewSchema } from '../utils/validation.js';
import { createError } from '../middleware/errorHandler.js';

// ─── GET /api/books/:id/reviews ─────────────────────────────────────────────
export async function listReviews(req, res, next) {
  try {
    const reviews = await prisma.review.findMany({
      where: { bookId: req.params.id },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ reviews });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/books/:id/reviews ────────────────────────────────────────────
export async function createReview(req, res, next) {
  try {
    const { success, data, errors } = validate(reviewSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    // Check book exists
    const book = await prisma.book.findUnique({ where: { id: req.params.id } });
    if (!book) throw createError(404, 'Book not found');

    // Check for existing review
    const existing = await prisma.review.findUnique({
      where: { userId_bookId: { userId: req.user.id, bookId: req.params.id } },
    });
    if (existing) {
      return res.status(409).json({ error: 'You have already reviewed this book. Edit your existing review instead.' });
    }

    const review = await prisma.review.create({
      data: {
        rating: data.rating,
        comment: data.comment,
        userId: req.user.id,
        bookId: req.params.id,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/reviews/:id ───────────────────────────────────────────────────
export async function updateReview(req, res, next) {
  try {
    const { success, data, errors } = validate(reviewSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw createError(404, 'Review not found');

    // Only the author can edit
    if (review.userId !== req.user.id) {
      throw createError(403, 'You can only edit your own reviews');
    }

    const updated = await prisma.review.update({
      where: { id: req.params.id },
      data: { rating: data.rating, comment: data.comment },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    res.json({ review: updated });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/reviews/:id ────────────────────────────────────────────────
export async function deleteReview(req, res, next) {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw createError(404, 'Review not found');

    // Author or admin can delete
    if (review.userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw createError(403, 'You can only delete your own reviews');
    }

    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    next(err);
  }
}
