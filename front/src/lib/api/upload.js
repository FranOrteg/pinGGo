import { api } from './index.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);

export function isImage(fileType) {
  return IMAGE_TYPES.has(fileType);
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Requests a presigned S3 PUT URL, uploads the file directly to S3,
 * and returns { fileUrl, fileName, fileSize, fileType }.
 *
 * @param {File} file
 * @param {(progress: number) => void} [onProgress] — 0–100
 */
export async function uploadFile(file, onProgress) {
  const { uploadUrl, fileUrl } = await api.post('/upload/presign', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });

  return {
    fileUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  };
}
