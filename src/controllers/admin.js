import prisma from '../config/db.js';
import { createError } from '../middleware/errorHandler.js';

// ─── GET /api/admin/analytics ───────────────────────────────────────────────
export async function getAnalytics(req, res, next) {
  try {
    const [totalBooks, totalMembers, totalReviews] = await Promise.all([
      prisma.book.count(),
      prisma.user.count({ where: { role: 'MEMBER' } }),
      prisma.review.count(),
    ]);

    // Total reads and downloads
    const bookStats = await prisma.book.aggregate({
      _sum: { readCount: true, downloadCount: true },
    });

    // Top 5 most-read books
    const topBooks = await prisma.book.findMany({
      orderBy: { readCount: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        author: true,
        coverImageUrl: true,
        readCount: true,
        downloadCount: true,
      },
    });

    // Recent members
    const recentMembers = await prisma.user.findMany({
      where: { role: 'MEMBER' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, createdAt: true, avatarUrl: true },
    });

    res.json({
      analytics: {
        totalBooks,
        totalMembers,
        totalReviews,
        totalReads: bookStats._sum.readCount || 0,
        totalDownloads: bookStats._sum.downloadCount || 0,
        topBooks,
        recentMembers,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/users ───────────────────────────────────────────────────
export async function listUsers(req, res, next) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          avatarUrl: true,
          createdAt: true,
          _count: { select: { reviews: true, readingProgress: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map((u) => ({
        ...u,
        reviewCount: u._count.reviews,
        booksRead: u._count.readingProgress,
        _count: undefined,
      })),
      pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/admin/users/:id ─────────────────────────────────────────────
export async function updateUser(req, res, next) {
  try {
    const { role, isActive } = req.body;
    const updateData = {};

    if (role !== undefined) {
      if (!['MEMBER', 'ADMIN'].includes(role)) {
        throw createError(400, 'Invalid role');
      }
      updateData.role = role;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    // Don't allow self-demotion
    if (req.params.id === req.user.id && role === 'MEMBER') {
      throw createError(400, 'You cannot demote yourself');
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/reviews ─────────────────────────────────────────────────
export async function listAllReviews(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          book: { select: { id: true, title: true, author: true, coverImageUrl: true } },
        },
      }),
      prisma.review.count(),
    ]);

    res.json({
      reviews,
      pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    next(err);
  }
}
