import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

const PROVIDER = process.env.FILE_STORAGE_PROVIDER || 'local';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;

// Initialize S3 client only if provider is s3
export const s3Client = PROVIDER === 's3' ? new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}) : null;

/**
 * Upload a file and return its URL.
 * Note: When using multer-s3, the upload is handled by the middleware, so this might only be used for manually uploading files from local disk if needed.
 * @param {string} filePath - Local path to the file.
 * @param {string} folder - Destination folder (e.g., 'books', 'covers').
 * @returns {Promise<string>} S3 Object Key or local path.
 */
export async function uploadFile(filePath, folder = 'books') {
  if (PROVIDER === 'local') {
    const filename = path.basename(filePath);
    return `/uploads/${filename}`;
  }

  // Not strictly used by our multer-s3 flow which uploads directly, but provided for completeness
  console.warn('Manual S3 upload called, usually handled by multer-s3');
  const filename = path.basename(filePath);
  return `${folder}/${filename}`;
}

/**
 * Delete a file by its Key (S3) or URL/path (local).
 */
export async function deleteFile(fileIdentifier) {
  if (PROVIDER === 'local') {
    const filename = path.basename(fileIdentifier);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return true;
  }

  if (PROVIDER === 's3' && s3Client) {
    try {
      // In our S3 implementation, the fileIdentifier is the object key (e.g., "pdfs/file.pdf")
      const command = new DeleteObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileIdentifier,
      });
      await s3Client.send(command);
      return true;
    } catch (error) {
      console.error(`Failed to delete S3 object ${fileIdentifier}:`, error);
      return false;
    }
  }

  return false;
}

/**
 * Generate a signed/time-limited URL for file access.
 * For local storage, returns the same path.
 */
export async function getSignedUrl(fileIdentifier) {
  if (PROVIDER === 'local') {
    return fileIdentifier;
  }

  if (PROVIDER === 's3' && s3Client) {
    try {
      const command = new GetObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileIdentifier,
      });
      // URL expires in 1 hour
      return await awsGetSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (error) {
      console.error(`Failed to generate signed URL for ${fileIdentifier}:`, error);
      return fileIdentifier;
    }
  }

  return fileIdentifier;
}

/**
 * Get a read stream for a file (Local or S3).
 * Useful for piping the file securely to the frontend.
 */
export async function getFileStream(fileIdentifier) {
  if (PROVIDER === 'local') {
    const filename = path.basename(fileIdentifier);
    const fullPath = path.join(UPLOAD_DIR, filename);
    return fs.createReadStream(fullPath);
  }

  if (PROVIDER === 's3' && s3Client) {
    const command = new GetObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: fileIdentifier,
    });
    const response = await s3Client.send(command);
    return response.Body; // This is a stream
  }
  
  throw new Error('Unsupported storage provider');
}

/**
 * Get the absolute filesystem path for a local file URL.
 */
export function getLocalPath(fileUrl) {
  const filename = path.basename(fileUrl);
  return path.join(UPLOAD_DIR, filename);
}
