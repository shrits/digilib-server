import prisma from '../config/db.js';
import { validate, progressSchema } from '../utils/validation.js';
import { createError } from '../middleware/errorHandler.js';

// ─── GET /api/users/me/progress ─────────────────────────────────────────────
export async function getMyProgress(req, res, next) {
  try {
    const progress = await prisma.readingProgress.findMany({
      where: { userId: req.user.id },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            coverImageUrl: true,
            fileUrlPdf: true,
            fileUrlEpub: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ progress });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/books/:id/progress ────────────────────────────────────────────
export async function updateProgress(req, res, next) {
  try {
    const { success, data, errors } = validate(progressSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const book = await prisma.book.findUnique({ where: { id: req.params.id } });
    if (!book) throw createError(404, 'Book not found');

    const progress = await prisma.readingProgress.upsert({
      where: {
        userId_bookId: { userId: req.user.id, bookId: req.params.id },
      },
      create: {
        userId: req.user.id,
        bookId: req.params.id,
        format: data.format,
        percentComplete: data.percentComplete,
        lastLocation: data.lastLocation,
      },
      update: {
        format: data.format,
        percentComplete: data.percentComplete,
        lastLocation: data.lastLocation,
      },
    });

    res.json({ progress });
  } catch (err) {
    next(err);
  }
}
