/**
 * Centralized error handler.
 * Catches errors from controllers and returns structured JSON responses.
 */
export function errorHandler(err, req, res, _next) {
  // Log the error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    const target = err.meta?.target;
    return res.status(409).json({
      error: 'Duplicate entry',
      message: `A record with this ${target?.join(', ') || 'value'} already exists.`,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Not found',
      message: 'The requested resource was not found.',
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large',
      message: 'The uploaded file exceeds the size limit.',
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Unexpected file',
      message: 'Unexpected file field in the upload.',
    });
  }

  // Custom app errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.name || 'Error',
      message: err.message,
    });
  }

  // Default 500
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong.',
  });
}

/**
 * Create an error with a status code that the error handler will pick up.
 */
export function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
