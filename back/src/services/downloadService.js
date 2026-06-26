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
const getFileFromDatabase = async (uuid) => {

    if(!uuid) {
        throw new Error('UUID is required');
    }

    const file = await queryOne('SELECT file_url,file_name FROM messages WHERE uuid = ?', [uuid]);

    if(!file) {
        throw new Error('File not found');
    }

    return file;
};
