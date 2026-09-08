import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { generateTokens, cookieOptions } from '../utils/token.js';
import {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from '../utils/validation.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/email.js';
import { createError } from '../middleware/errorHandler.js';

const SALT_ROUNDS = 12;
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 min
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Helper: set auth cookies on the response.
 */
function setAuthCookies(res, tokens) {
  res.cookie('accessToken', tokens.accessToken, cookieOptions(ACCESS_COOKIE_MAX_AGE));
  res.cookie('refreshToken', tokens.refreshToken, cookieOptions(REFRESH_COOKIE_MAX_AGE));
}

/**
 * Helper: format user for client response (strip sensitive fields).
 */
function formatUser(user) {
  const { passwordHash, resetToken, resetTokenExpiry, ...safeUser } = user;
  return safeUser;
}

// ─── POST /api/auth/register ────────────────────────────────────────────────
export async function register(req, res, next) {
  try {
    const { success, data, errors } = validate(registerSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    // Check if email already in use
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'MEMBER',
      },
    });

    const tokens = generateTokens(user);
    setAuthCookies(res, tokens);

    // Send welcome email (fire-and-forget)
    sendWelcomeEmail(user).catch((err) => console.error('Welcome email failed:', err));

    res.status(201).json({ user: formatUser(user) });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/login ───────────────────────────────────────────────────
export async function login(req, res, next) {
  try {
    const { success, data, errors } = validate(loginSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated' });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokens = generateTokens(user);
    setAuthCookies(res, tokens);

    res.json({ user: formatUser(user) });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
export async function logout(req, res) {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.json({ message: 'Logged out successfully' });
}

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
export async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: formatUser(user) });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { success, data, errors } = validate(forgotPasswordSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (user && user.passwordHash) {
      // Generate a secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry },
      });

      sendPasswordResetEmail(user, resetToken).catch((err) =>
        console.error('Reset email failed:', err)
      );
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
export async function resetPassword(req, res, next) {
  try {
    const { success, data, errors } = validate(resetPasswordSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const user = await prisma.user.findFirst({
      where: {
        resetToken: data.token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/auth/profile ──────────────────────────────────────────────────
export async function updateProfile(req, res, next) {
  try {
    const { success, data, errors } = validate(updateProfileSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });

    res.json({ user: formatUser(user) });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/auth/change-password ──────────────────────────────────────────
export async function changePassword(req, res, next) {
  try {
    const { success, data, errors } = validate(changePasswordSchema, req.body);
    if (!success) return res.status(400).json({ error: 'Validation failed', details: errors });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Password change not available for OAuth accounts' });
    }

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── Google OAuth callback handler ──────────────────────────────────────────
export async function googleCallback(req, res, next) {
  try {
    // passport-google-oauth20 attaches the profile to req.user
    const profile = req.user;

    if (!profile) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        oauthProvider: 'google',
        oauthId: profile.id,
      },
    });

    if (!user) {
      // Check if email is already registered
      const email = profile.emails?.[0]?.value;
      if (email) {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          // Link Google account to existing user
          user = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              oauthProvider: 'google',
              oauthId: profile.id,
              avatarUrl: existingUser.avatarUrl || profile.photos?.[0]?.value,
            },
          });
        }
      }

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: profile.displayName || 'User',
            email: profile.emails?.[0]?.value || `${profile.id}@google.oauth`,
            oauthProvider: 'google',
            oauthId: profile.id,
            avatarUrl: profile.photos?.[0]?.value,
            role: 'MEMBER',
          },
        });

        sendWelcomeEmail(user).catch((err) => console.error('Welcome email failed:', err));
      }
    }

    if (!user.isActive) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_deactivated`);
    }

    const tokens = generateTokens(user);
    setAuthCookies(res, tokens);

    res.redirect(`${process.env.FRONTEND_URL}/`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
}
