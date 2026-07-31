import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import config from '../config/index.js';
import { queryOne } from '../db/pool.js';

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // PDF
  'application/pdf',

  // Microsoft Word
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  // Microsoft Excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  // Microsoft PowerPoint
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',

  // Text / Data
  'text/plain',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',

  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',

  // Audio
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp4',
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
  const { fileName, fileType, fileSize, channelId } = req.body;

  if (!fileName || !fileType || !fileSize || !channelId) {
    return res.status(400).json({ error: 'fileName, fileType, fileSize and channelId are required' });
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

  // Only channel members are allowed to upload attachments into that channel
  const membership = await queryOne(
    `SELECT 1 FROM channel_members cm
     JOIN channels c ON c.id = cm.channel_id
     JOIN users u ON u.id = cm.user_id
     WHERE c.uuid = ? AND u.uuid = ?`,
    [channelId, req.user.sub]
  );
  if (!membership) return res.status(403).json({ error: 'Not a member of this channel' });

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

  res.json({ uploadUrl, fileKey: key });
}
