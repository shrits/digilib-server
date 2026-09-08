import { verifyAccessToken, verifyRefreshToken, generateTokens, cookieOptions } from '../utils/token.js';
import prisma from '../config/db.js';

/**
 * Authenticate requests via JWT access token in httpOnly cookie.
 * Attaches req.user = { id, email, role }.
 */
export async function authenticate(req, res, next) {
  try {
    const accessToken = req.cookies?.accessToken;

    if (!accessToken) {
      // Try to refresh silently
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        try {
          const payload = verifyRefreshToken(refreshToken);
          const user = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { id: true, email: true, role: true, isActive: true },
          });

          if (user && user.isActive) {
            const tokens = generateTokens(user);
            res.cookie('accessToken', tokens.accessToken, cookieOptions(15 * 60 * 1000));
            res.cookie('refreshToken', tokens.refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
            req.user = { id: user.id, email: user.email, role: user.role };
            return next();
          }
        } catch {
          // Refresh token invalid — fall through to 401
        }
      }

      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const payload = verifyAccessToken(accessToken);
      req.user = { id: payload.id, email: payload.email, role: payload.role };
      next();
    } catch {
      // Access token expired — try refresh
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const refreshPayload = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({
        where: { id: refreshPayload.id },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Account not found or deactivated' });
      }

      const tokens = generateTokens(user);
      res.cookie('accessToken', tokens.accessToken, cookieOptions(15 * 60 * 1000));
      res.cookie('refreshToken', tokens.refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
      req.user = { id: user.id, email: user.email, role: user.role };
      next();
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require a specific role (e.g., 'ADMIN').
 * Must be used after `authenticate`.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
