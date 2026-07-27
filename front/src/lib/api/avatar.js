import { api } from './index.js';

const avatarUrlCache = new Map();

export async function uploadAvatar(file) {
  if (!file) throw new Error('No avatar selected');

  const { uploadUrl, avatarKey } = await api.post('/users/me/avatar/presign', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error(`Avatar upload failed: ${response.status}`);

  const { user } = await api.patch('/users/me', { avatarUrl: avatarKey });
  clearAvatarUrl(user.uuid);
  return user;
}

export async function getAvatarUrl(userId, avatarKey) {
  if (!userId || !avatarKey) return null;
  if (/^https?:\/\//i.test(avatarKey)) return avatarKey;

  const cacheKey = `${userId}:${avatarKey}`;
  if (avatarUrlCache.has(cacheKey)) return avatarUrlCache.get(cacheKey);
  const { avatarUrl } = await api.get(`/users/${encodeURIComponent(userId)}/avatar/presign`);
  avatarUrlCache.set(cacheKey, avatarUrl);
  return avatarUrl;
}

export function clearAvatarUrl(userId) {
  for (const key of avatarUrlCache.keys()) {
    if (key.startsWith(`${userId}:`)) avatarUrlCache.delete(key);
  }
}
