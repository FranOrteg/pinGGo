import { api } from './index.js';

const fileUrlCache = new Map();
const viewUrlCache = new Map();
const thumbnailUrlCache = new Map();

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
  if (fileUrlCache.has(messageId)) {
    return fileUrlCache.get(messageId);
  }
  const response = await api.get(`/download/presign?uuid=${encodeURIComponent(messageId)}`);
  fileUrlCache.set(messageId, response.downloadUrl);
  return response.downloadUrl;
}

export async function getViewUrl(messageId) {
  if (viewUrlCache.has(messageId)) {
    return viewUrlCache.get(messageId);
  }
  const response = await api.get(`/download/presign?uuid=${encodeURIComponent(messageId)}&view=true`);
  viewUrlCache.set(messageId, response.downloadUrl);
  return response.downloadUrl;
}

export async function getThumbnailUrl(messageId) {
  if (thumbnailUrlCache.has(messageId)) return thumbnailUrlCache.get(messageId);
  try {
    const response = await api.get(`/thumbnails/presign?uuid=${encodeURIComponent(messageId)}`);
    if (response.url) {
      thumbnailUrlCache.set(messageId, response.url);
      return response.url;
    }
  } catch {}
  // Don't cache a failure: the thumbnail may still be generating, so a later
  // thumbnail:ready event should be able to retry the request.
  return null;
}

/** Drops any cached thumbnail URL so the next request re-fetches a fresh one. */
export function invalidateThumbnailCache(messageId) {
  thumbnailUrlCache.delete(messageId);
}
