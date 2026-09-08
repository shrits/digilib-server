import prisma from '../config/db.js';
import { createError } from '../middleware/errorHandler.js';

// ─── GET /api/users/me/wishlist ─────────────────────────────────────────────
export async function getWishlist(req, res, next) {
  try {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.user.id },
      include: {
        book: {
          include: {
            genres: { include: { genre: true } },
            reviews: { select: { rating: true } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    const wishlist = items.map((item) => {
      const avgRating =
        item.book.reviews.length > 0
          ? item.book.reviews.reduce((sum, r) => sum + r.rating, 0) / item.book.reviews.length
          : 0;

      return {
        id: item.id,
        addedAt: item.addedAt,
        book: {
          ...item.book,
          genres: item.book.genres.map((bg) => bg.genre),
          averageRating: Math.round(avgRating * 10) / 10,
          reviewCount: item.book.reviews.length,
          reviews: undefined,
        },
      };
    });

    res.json({ wishlist });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users/me/wishlist/:bookId ────────────────────────────────────
export async function addToWishlist(req, res, next) {
  try {
    const book = await prisma.book.findUnique({ where: { id: req.params.bookId } });
    if (!book) throw createError(404, 'Book not found');

    const existing = await prisma.wishlistItem.findUnique({
      where: { userId_bookId: { userId: req.user.id, bookId: req.params.bookId } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Book is already in your wishlist' });
    }

    const item = await prisma.wishlistItem.create({
      data: {
        userId: req.user.id,
        bookId: req.params.bookId,
      },
    });

    res.status(201).json({ wishlistItem: item });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/users/me/wishlist/:bookId ──────────────────────────────────
export async function removeFromWishlist(req, res, next) {
  try {
    const item = await prisma.wishlistItem.findUnique({
      where: { userId_bookId: { userId: req.user.id, bookId: req.params.bookId } },
    });

    if (!item) throw createError(404, 'Book not in your wishlist');

    await prisma.wishlistItem.delete({ where: { id: item.id } });
    res.json({ message: 'Removed from wishlist' });
  } catch (err) {
    next(err);
  }
}
