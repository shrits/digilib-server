/**
 * File storage service — abstracted interface.
 * Default: local filesystem storage for development.
 * Override FILE_STORAGE_PROVIDER for S3/Cloudinary/Supabase in production.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PROVIDER = process.env.FILE_STORAGE_PROVIDER || 'local';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Upload a file and return its URL.
 * @param {string} filePath - Local path to the file (from multer).
 * @param {string} folder - Destination folder (e.g., 'books', 'covers').
 * @returns {Promise<string>} Public URL or local path.
 */
export async function uploadFile(filePath, folder = 'books') {
  if (PROVIDER === 'local') {
    // For local storage, files are already saved by multer.
    // Return a relative path the API can serve.
    const filename = path.basename(filePath);
    return `/uploads/${filename}`;
  }

  // Future: S3, Cloudinary, Supabase implementations
  console.warn(`Storage provider "${PROVIDER}" not implemented. Using local fallback.`);
  const filename = path.basename(filePath);
  return `/uploads/${filename}`;
}

/**
 * Delete a file by its URL/path.
 */
export async function deleteFile(fileUrl) {
  if (PROVIDER === 'local') {
    const filename = path.basename(fileUrl);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return true;
  }

  console.warn(`Storage provider "${PROVIDER}" delete not implemented.`);
  return false;
}

/**
 * Generate a signed/time-limited URL for file access.
 * For local storage, returns the same path (no signing needed in dev).
 */
export async function getSignedUrl(fileUrl) {
  if (PROVIDER === 'local') {
    return fileUrl;
  }

  // Future: generate pre-signed URLs for cloud storage
  return fileUrl;
}

/**
 * Get the absolute filesystem path for a local file URL.
 */
export function getLocalPath(fileUrl) {
  const filename = path.basename(fileUrl);
  return path.join(UPLOAD_DIR, filename);
}
