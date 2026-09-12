import multer from 'multer';
import path from 'path';
import fs from 'fs';
import multerS3 from 'multer-s3';
import { createError } from './errorHandler.js';
import { s3Client } from '../services/storage.js';

const PROVIDER = process.env.FILE_STORAGE_PROVIDER || 'local';
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;

let storage;

if (PROVIDER === 's3' && s3Client) {
  storage = multerS3({
    s3: s3Client,
    bucket: AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      const filename = `${uniqueSuffix}${ext}`;
      
      // Determine folder based on fieldname
      let folder = 'other';
      if (file.fieldname === 'pdfFile' || file.fieldname === 'epubFile') {
        folder = 'pdfs';
      } else if (file.fieldname === 'coverImage') {
        folder = 'covers';
      }
      
      cb(null, `${folder}/${filename}`);
    }
  });
} else {
  // Ensure local uploads directory exists
  const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    },
  });
}

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
