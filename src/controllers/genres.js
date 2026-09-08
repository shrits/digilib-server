import prisma from '../config/db.js';
import { validate, genreSchema } from '../utils/validation.js';
import { createError } from '../middleware/errorHandler.js';

// ─── GET /api/genres ────────────────────────────────────────────────────────
export async function listGenres(req, res, next) {
  try {
    const genres = await prisma.genre.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { books: true } } },
    });

    res.json({
      genres: genres.map((g) => ({
        id: g.id,
        name: g.name,
        bookCount: g._count.books,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/genres (admin) ───────────────────────────────────────────────
export async function createGenre(req, res, next) {
  try {
    const { success, data, errors } = validate(genreSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const genre = await prisma.genre.create({ data: { name: data.name } });
    res.status(201).json({ genre });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/genres/:id (admin) ────────────────────────────────────────────
export async function updateGenre(req, res, next) {
  try {
    const { success, data, errors } = validate(genreSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const genre = await prisma.genre.update({
      where: { id: req.params.id },
      data: { name: data.name },
    });

    res.json({ genre });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/genres/:id (admin) ─────────────────────────────────────────
export async function deleteGenre(req, res, next) {
  try {
    await prisma.genre.delete({ where: { id: req.params.id } });
    res.json({ message: 'Genre deleted successfully' });
  } catch (err) {
    next(err);
  }
}
