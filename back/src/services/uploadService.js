import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import config from '../config/index.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav',
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function getS3Client() {
  return new S3Client({
    region: config.s3.region,
    credentials: config.s3.accessKeyId
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined, // falls back to IAM role / env vars when deployed on EC2/ECS
  });
}

export async function createPresignedUpload(req, res) {
  const { fileName, fileType, fileSize } = req.body;

  if (!fileName || !fileType || !fileSize) {
    return res.status(400).json({ error: 'fileName, fileType and fileSize are required' });
  }

  if (!ALLOWED_MIME_TYPES.has(fileType)) {
    return res.status(415).json({ error: 'File type not allowed' });
  }

  if (Number(fileSize) > MAX_FILE_SIZE) {
    return res.status(413).json({ error: 'File too large (max 25 MB)' });
  }

  if (!config.s3.bucket) {
    return res.status(503).json({ error: 'S3 not configured' });
  }

  const ext = path.extname(fileName).toLowerCase();
  const key = `attachments/${req.user.sub}/${uuidv4()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: fileType,
    ContentLength: Number(fileSize),
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });
  const fileUrl = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;

  res.json({ uploadUrl, fileUrl, key });
}
