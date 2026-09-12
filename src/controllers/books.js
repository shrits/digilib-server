import prisma from '../config/db.js';
import { validate, bookSchema } from '../utils/validation.js';
import { uploadFile, deleteFile, getSignedUrl, getLocalPath, getFileStream } from '../services/storage.js';
import { lookupMetadata } from '../services/metadataLookup.js';
import { createError } from '../middleware/errorHandler.js';
import fs from 'fs';
import path from 'path';

// ─── GET /api/books ─────────────────────────────────────────────────────────
export async function listBooks(req, res, next) {
  try {
    const { search, genre, sort = 'newest', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (genre) {
      where.genres = { some: { genre: { name: { equals: genre, mode: 'insensitive' } } } };
    }

    // Build orderBy
    let orderBy;
    switch (sort) {
      case 'title':
        orderBy = { title: 'asc' };
        break;
      case 'rating':
        orderBy = { reviews: { _count: 'desc' } };
        break;
      case 'popular':
        orderBy = { readCount: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          genres: { include: { genre: true } },
          reviews: { select: { rating: true } },
          _count: { select: { reviews: true, readingProgress: true } },
        },
      }),
      prisma.book.count({ where }),
    ]);

    // Compute average rating for each book
    const booksWithRating = books.map((book) => {
      const avgRating =
        book.reviews.length > 0
          ? book.reviews.reduce((sum, r) => sum + r.rating, 0) / book.reviews.length
          : 0;

      return {
        ...book,
        genres: book.genres.map((bg) => bg.genre),
        averageRating: Math.round(avgRating * 10) / 10,
        reviewCount: book._count.reviews,
        readerCount: book._count.readingProgress,
        reviews: undefined, // Don't send individual reviews in list
        _count: undefined,
      };
    });

    res.json({
      books: booksWithRating,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/books/featured ────────────────────────────────────────────────
export async function getFeaturedBooks(req, res, next) {
  try {
    const [recentBooks, popularBooks] = await Promise.all([
      prisma.book.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          genres: { include: { genre: true } },
          reviews: { select: { rating: true } },
        },
      }),
      prisma.book.findMany({
        orderBy: { readCount: 'desc' },
        take: 10,
        include: {
          genres: { include: { genre: true } },
          reviews: { select: { rating: true } },
        },
      }),
    ]);

    const formatBooks = (books) =>
      books.map((book) => {
        const avgRating =
          book.reviews.length > 0
            ? book.reviews.reduce((sum, r) => sum + r.rating, 0) / book.reviews.length
            : 0;
        return {
          ...book,
          genres: book.genres.map((bg) => bg.genre),
          averageRating: Math.round(avgRating * 10) / 10,
          reviewCount: book.reviews.length,
          reviews: undefined,
        };
      });

    res.json({
      recentlyAdded: formatBooks(recentBooks),
      featured: formatBooks(popularBooks),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/books/:id ─────────────────────────────────────────────────────
export async function getBook(req, res, next) {
  try {
    const book = await prisma.book.findUnique({
      where: { id: req.params.id },
      include: {
        genres: { include: { genre: true } },
        reviews: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
        addedByAdmin: { select: { id: true, name: true } },
        _count: { select: { reviews: true, readingProgress: true, wishlistItems: true } },
      },
    });

    if (!book) {
      throw createError(404, 'Book not found');
    }

    const avgRating =
      book.reviews.length > 0
        ? book.reviews.reduce((sum, r) => sum + r.rating, 0) / book.reviews.length
        : 0;

    res.json({
      book: {
        ...book,
        genres: book.genres.map((bg) => bg.genre),
        averageRating: Math.round(avgRating * 10) / 10,
        reviewCount: book._count.reviews,
        readerCount: book._count.readingProgress,
        wishlistCount: book._count.wishlistItems,
        _count: undefined,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/books (admin) ────────────────────────────────────────────────
export async function createBook(req, res, next) {
  try {
    // Parse metadata from multipart body
    const metadata = {
      title: req.body.title,
      author: req.body.author,
      description: req.body.description || null,
      isbn: req.body.isbn || null,
      coverImageUrl: req.body.coverImageUrl || null,
      publisher: req.body.publisher || null,
      publishedDate: req.body.publishedDate || null,
      pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : null,
      language: req.body.language || 'en',
      genreIds: req.body.genreIds ? JSON.parse(req.body.genreIds) : [],
    };

    const { success, data, errors } = validate(bookSchema, metadata);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    // Handle file uploads
    let fileUrlPdf = null;
    let fileUrlEpub = null;
    let coverImageUrl = data.coverImageUrl;

    if (req.files?.pdfFile?.[0]) {
      const f = req.files.pdfFile[0];
      fileUrlPdf = f.key ? f.key : await uploadFile(f.path, 'books');
    }
    if (req.files?.epubFile?.[0]) {
      const f = req.files.epubFile[0];
      fileUrlEpub = f.key ? f.key : await uploadFile(f.path, 'books');
    }
    if (req.files?.coverImage?.[0]) {
      const f = req.files.coverImage[0];
      coverImageUrl = f.key ? `/uploads/${f.key}` : await uploadFile(f.path, 'covers');
    }

    if (!fileUrlPdf && !fileUrlEpub) {
      return res.status(400).json({ error: 'At least one book file (PDF or EPUB) is required' });
    }

    const { genreIds, ...bookData } = data;

    const book = await prisma.book.create({
      data: {
        ...bookData,
        fileUrlPdf,
        fileUrlEpub,
        coverImageUrl,
        addedByAdminId: req.user.id,
        genres: genreIds?.length
          ? { create: genreIds.map((genreId) => ({ genreId })) }
          : undefined,
      },
      include: {
        genres: { include: { genre: true } },
      },
    });

    res.status(201).json({
      book: { ...book, genres: book.genres.map((bg) => bg.genre) },
    });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/books/:id (admin) ─────────────────────────────────────────────
export async function updateBook(req, res, next) {
  try {
    const existing = await prisma.book.findUnique({ where: { id: req.params.id } });
    if (!existing) throw createError(404, 'Book not found');

    const metadata = {
      title: req.body.title || existing.title,
      author: req.body.author || existing.author,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      isbn: req.body.isbn !== undefined ? req.body.isbn : existing.isbn,
      coverImageUrl: req.body.coverImageUrl !== undefined ? req.body.coverImageUrl : existing.coverImageUrl,
      publisher: req.body.publisher !== undefined ? req.body.publisher : existing.publisher,
      publishedDate: req.body.publishedDate !== undefined ? req.body.publishedDate : existing.publishedDate,
      pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : existing.pageCount,
      language: req.body.language || existing.language,
      genreIds: req.body.genreIds ? JSON.parse(req.body.genreIds) : undefined,
    };

    // Handle new file uploads
    let fileUrlPdf = existing.fileUrlPdf;
    let fileUrlEpub = existing.fileUrlEpub;
    let coverImageUrl = metadata.coverImageUrl;

    if (req.files?.pdfFile?.[0]) {
      if (existing.fileUrlPdf) await deleteFile(existing.fileUrlPdf);
      const f = req.files.pdfFile[0];
      fileUrlPdf = f.key ? f.key : await uploadFile(f.path, 'books');
    }
    if (req.files?.epubFile?.[0]) {
      if (existing.fileUrlEpub) await deleteFile(existing.fileUrlEpub);
      const f = req.files.epubFile[0];
      fileUrlEpub = f.key ? f.key : await uploadFile(f.path, 'books');
    }
    if (req.files?.coverImage?.[0]) {
      if (existing.coverImageUrl && existing.coverImageUrl.startsWith('/uploads')) await deleteFile(existing.coverImageUrl);
      const f = req.files.coverImage[0];
      coverImageUrl = f.key ? `/uploads/${f.key}` : await uploadFile(f.path, 'covers');
    }

    const { genreIds, ...bookData } = metadata;

    // Update genres if provided
    if (genreIds) {
      await prisma.bookGenre.deleteMany({ where: { bookId: req.params.id } });
    }

    const book = await prisma.book.update({
      where: { id: req.params.id },
      data: {
        ...bookData,
        fileUrlPdf,
        fileUrlEpub,
        coverImageUrl,
        genres: genreIds
          ? { create: genreIds.map((genreId) => ({ genreId })) }
          : undefined,
      },
      include: {
        genres: { include: { genre: true } },
      },
    });

    res.json({ book: { ...book, genres: book.genres.map((bg) => bg.genre) } });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/books/:id (admin) ──────────────────────────────────────────
export async function deleteBook(req, res, next) {
  try {
    const book = await prisma.book.findUnique({ where: { id: req.params.id } });
    if (!book) throw createError(404, 'Book not found');

    // Delete files
    if (book.fileUrlPdf) await deleteFile(book.fileUrlPdf);
    if (book.fileUrlEpub) await deleteFile(book.fileUrlEpub);

    await prisma.book.delete({ where: { id: req.params.id } });

    res.json({ message: 'Book deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/books/metadata-lookup ─────────────────────────────────────────
export async function metadataLookup(req, res, next) {
  try {
    const { title, isbn } = req.query;
    if (!title && !isbn) {
      return res.status(400).json({ error: 'Provide a title or ISBN to search' });
    }

    const results = await lookupMetadata({ title, isbn });
    res.json({ results });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/books/:id/read ────────────────────────────────────────────────
export async function readBook(req, res, next) {
  try {
    const { format = 'pdf' } = req.query;
    const book = await prisma.book.findUnique({ where: { id: req.params.id } });

    if (!book) throw createError(404, 'Book not found');

    const fileUrl = format === 'epub' ? book.fileUrlEpub : book.fileUrlPdf;
    if (!fileUrl) throw createError(404, `No ${format.toUpperCase()} file available for this book`);

    // Increment read count
    await prisma.book.update({
      where: { id: req.params.id },
      data: { readCount: { increment: 1 } },
    });

    const contentType = format === 'epub' ? 'application/epub+zip' : 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${book.title}.${format}"`);
    
    const stream = await getFileStream(fileUrl);
    stream.on('error', (err) => {
      console.error(`Stream error for ${fileUrl}:`, err.message);
      if (!res.headersSent) res.status(404).send('File not found');
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/books/:id/download ────────────────────────────────────────────
export async function downloadBook(req, res, next) {
  try {
    const { format = 'pdf' } = req.query;
    const book = await prisma.book.findUnique({ where: { id: req.params.id } });

    if (!book) throw createError(404, 'Book not found');

    const fileUrl = format === 'epub' ? book.fileUrlEpub : book.fileUrlPdf;
    if (!fileUrl) throw createError(404, `No ${format.toUpperCase()} file available for this book`);

    // Increment download count
    await prisma.book.update({
      where: { id: req.params.id },
      data: { downloadCount: { increment: 1 } },
    });

    const contentType = format === 'epub' ? 'application/epub+zip' : 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${book.title}.${format}"`);
    
    const stream = await getFileStream(fileUrl);
    stream.on('error', (err) => {
      console.error(`Stream error for ${fileUrl}:`, err.message);
      if (!res.headersSent) res.status(404).send('File not found');
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
