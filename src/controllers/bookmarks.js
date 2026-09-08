import prisma from '../config/db.js';
import { validate, bookmarkSchema } from '../utils/validation.js';
import { createError } from '../middleware/errorHandler.js';

// ─── GET /api/books/:id/bookmarks ───────────────────────────────────────────
export async function listBookmarks(req, res, next) {
  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { bookId: req.params.id, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ bookmarks });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/books/:id/bookmarks ──────────────────────────────────────────
export async function createBookmark(req, res, next) {
  try {
    const { success, data, errors } = validate(bookmarkSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const book = await prisma.book.findUnique({ where: { id: req.params.id } });
    if (!book) throw createError(404, 'Book not found');

    const bookmark = await prisma.bookmark.create({
      data: {
        location: data.location,
        note: data.note,
        userId: req.user.id,
        bookId: req.params.id,
      },
    });

    res.status(201).json({ bookmark });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/bookmarks/:id ──────────────────────────────────────────────
export async function deleteBookmark(req, res, next) {
  try {
    const bookmark = await prisma.bookmark.findUnique({ where: { id: req.params.id } });
    if (!bookmark) throw createError(404, 'Bookmark not found');

    if (bookmark.userId !== req.user.id) {
      throw createError(403, 'You can only delete your own bookmarks');
    }

    await prisma.bookmark.delete({ where: { id: req.params.id } });
    res.json({ message: 'Bookmark deleted successfully' });
  } catch (err) {
    next(err);
  }
}
