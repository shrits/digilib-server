import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional().nullable(),
});

export const bookmarkSchema = z.object({
  location: z.string().min(1, 'Location is required'),
  note: z.string().max(500).optional().nullable(),
});

export const progressSchema = z.object({
  format: z.enum(['pdf', 'epub']),
  percentComplete: z.number().min(0).max(100),
  lastLocation: z.string().optional().nullable(),
});

export const genreSchema = z.object({
  name: z.string().min(1, 'Genre name is required').max(50),
});

export const bookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  author: z.string().min(1, 'Author is required').max(300),
  description: z.string().max(10000).optional().nullable(),
  isbn: z.string().max(20).optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  publisher: z.string().max(200).optional().nullable(),
  publishedDate: z.string().max(20).optional().nullable(),
  pageCount: z.number().int().positive().optional().nullable(),
  language: z.string().max(10).optional().nullable(),
  genreIds: z.array(z.string().uuid()).optional(),
});

/**
 * Validate a request body against a Zod schema.
 * Returns { success, data, errors }.
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  return { success: false, data: null, errors };
}
