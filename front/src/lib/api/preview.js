import { api } from './index.js';

const previewCache = new Map();

/**
 * Fetches normalized link-preview metadata for a URL.
 * Returns null on any failure so callers can fail silently.
 */
export async function getLinkPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  try {
    const data = await api.get(`/previews/resolve?url=${encodeURIComponent(url)}`);
    previewCache.set(url, data);
    return data;
  } catch {
    return null;
  }
}

export function invalidatePreviewCache(url) {
  previewCache.delete(url);
}
