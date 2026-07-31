import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config/index.js';
import { queryOne } from '../db/pool.js';


function getS3Client() {
  return new S3Client({
    region: config.s3.region,
    credentials: config.s3.accessKeyId
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined, // falls back to IAM role / env vars when deployed on EC2/ECS
  });
}

// Althernative method to get file from database
export async function getFileFromDatabase(uuid) {

    if(!uuid) {
        throw new Error('UUID is required');
    }

    const file = await queryOne(
      `SELECT m.file_key, m.file_name, m.file_type, m.channel_id, c.uuid AS channel_uuid
       FROM messages m
       JOIN channels c ON c.id = m.channel_id
       WHERE m.uuid = ?`,
      [uuid]
    );


    if(!file || !file.file_key) {
        throw new Error('File not found');
    }

    return file;
};

/** Verifies the requesting user belongs to the channel that owns the file. */
export async function assertChannelMembership(channelId, userUuid) {
    const member = await queryOne(
        `SELECT 1 FROM channel_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.channel_id = ? AND u.uuid = ?`,
        [channelId, userUuid]
    );
    return !!member;
}

export async function createPresignedDownload(uuid, userUuid, { view = false } = {}) {
    const file = await getFileFromDatabase(uuid);

    if (!file) {
        throw new Error('File not found');
    }

    const hasAccess = await assertChannelMembership(file.channel_id, userUuid);
    if (!hasAccess) {
        const err = new Error('Access denied');
        err.status = 403;
        throw err;
    }

    const key = file.file_key;

    const command = new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        ...(view ? {} : { ResponseContentDisposition: `attachment; filename="${file.file_name}"` }),
    });

    const downloadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });

    return {
        downloadUrl,
        fileName: file.file_name,
    }
}
