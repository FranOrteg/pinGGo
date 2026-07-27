import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import config from '../config/index.js';
import { queryOne } from '../db/pool.js';

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function getS3Client() {
  return new S3Client({
    region: config.s3.region,
    credentials: config.s3.accessKeyId
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined,
  });
}

export async function createPresignedAvatarUpload(req, res, next) {
  try {
    const { fileName, fileType, fileSize } = req.body;
    if (!fileName || !fileType || !fileSize) {
      return res.status(400).json({ error: 'fileName, fileType and fileSize are required' });
    }
    if (!ALLOWED_AVATAR_TYPES.has(fileType)) {
      return res.status(415).json({ error: 'Avatar must be a JPEG, PNG, GIF or WebP image' });
    }
    if (Number(fileSize) > MAX_AVATAR_SIZE) {
      return res.status(413).json({ error: 'Avatar is too large (max 5 MB)' });
    }
    if (!config.s3.bucket) return res.status(503).json({ error: 'S3 not configured' });

    const extension = path.extname(fileName).toLowerCase();
    const avatarKey = `avatars/${req.user.sub}/${uuidv4()}${extension}`;
    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: avatarKey,
      ContentType: fileType,
      ContentLength: Number(fileSize),
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });
    res.json({ uploadUrl, avatarKey });
  } catch (err) {
    next(err);
  }
}

export async function createPresignedAvatarDownload(req, res, next) {
  try {
    const user = await queryOne('SELECT avatar_url FROM users WHERE uuid = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.avatar_url) return res.status(404).json({ error: 'Avatar not found' });

    // Preserve any legacy externally hosted avatar URLs.
    if (/^https?:\/\//i.test(user.avatar_url)) return res.json({ avatarUrl: user.avatar_url });
    if (!config.s3.bucket) return res.status(503).json({ error: 'S3 not configured' });

    const command = new GetObjectCommand({ Bucket: config.s3.bucket, Key: user.avatar_url });
    const avatarUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
    res.json({ avatarUrl });
  } catch (err) {
    next(err);
  }
}
