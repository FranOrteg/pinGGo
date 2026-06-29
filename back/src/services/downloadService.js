import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


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

    const file = await queryOne('SELECT file_url,file_name FROM messages WHERE uuid = ?', [uuid]);

    if(!file) {
        throw new Error('File not found');
    }

    return file;
};

export async function createPresignedDownload(uuid) {
    const file = await getFileFromDatabase(uuid);

    if (!file) {
        throw new Error('File not found');
    }

    const url = new URL(file.file_url);


    const key = decodeURIComponent(
        url.pathname.replace(/^\/+/, '')
    );

    const command = new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${file.file_name}"`,
    });

    const downloadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });

    return {
        downloadUrl,
        fileName: file.file_name,
    }
}
