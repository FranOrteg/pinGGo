import { api } from './index.js';

/**
 * Requests a presigned S3 GET URL and downloads the file from S3.
 *
 * @param {string} fileUrl - The URL of the file to download
 * @param {string} fileName - The name of the file to download
 */

export async function downloadFile(uuid, fileName) {
  const response = await api.get(`/download/presign?uuid=${encodeURIComponent(uuid)}`);

  const { downloadUrl } = response;  
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName || '';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return downloadUrl;
}

export async function getFileUrl(messageId) {
  const response = await api.get(`/download/presign?uuid=${encodeURIComponent(messageId)}`);
  return response.downloadUrl;
}
