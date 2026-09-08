import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createError } from './errorHandler.js';

// Ensure local uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/epub+zip',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(createError(400, `File type ${file.mimetype} is not allowed. Allowed: PDF, EPUB, JPEG, PNG, WebP`), false);
  }
};

/**
 * Multer instance for book file uploads.
 * Accepts 'pdfFile', 'epubFile', and 'coverImage' fields.
 * Max file size: 100MB for books, 5MB for covers.
 */
export const uploadBookFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
}).fields([
  { name: 'pdfFile', maxCount: 1 },
  { name: 'epubFile', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);

export default multer({ storage, fileFilter });
