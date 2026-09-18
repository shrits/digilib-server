import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate an access + refresh token pair for a user.
 */
export function generateTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };

  const accessToken = jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
  const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });

  return { accessToken, refreshToken };
}

/**
 * Verify an access token and return its payload.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

/**
 * Verify a refresh token and return its payload.
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/**
 * Cookie options for auth tokens.
 */
export function cookieOptions(maxAgeMs) {
  const isProduction = process.env.NODE_ENV === 'production';
  // If frontend and backend are on different origins, use 'none' to allow cross-origin cookies
  const isCrossOrigin = isProduction && process.env.FRONTEND_URL && 
    new URL(process.env.FRONTEND_URL).origin !== `http://localhost:${process.env.PORT || 3001}`;
  
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isCrossOrigin ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}
