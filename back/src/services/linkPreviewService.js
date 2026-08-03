import { URL } from 'node:url';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { getRedis } from '../redis/client.js';

const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB of HTML is more than enough for metadata
const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2048;

const CACHE_TTL_FULL = 24 * 60 * 60; // seconds — successful metadata
const CACHE_TTL_FALLBACK = 30 * 60; // seconds — derived/minimal previews

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.lan'];

const UA =
  'Mozilla/5.0 (compatible; PinGGoLinkPreview/1.0)';

class PreviewError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const blocked = (msg = 'URL not allowed') =>
  new PreviewError(400, msg, 'BLOCKED');

const fetchFailed = (msg = 'Could not fetch URL') =>
  new PreviewError(502, msg, 'FETCH_FAILED');

const timedOut = () =>
  new PreviewError(408, 'Timed out fetching URL', 'TIMEOUT');

// ────────────────────────────── SSRF guards ──────────────────────────────

function isPrivateIPv4(addr) {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b, c] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8
    a === 255 || // 255.255.255.255/32
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24
    (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24
    (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(addr) {
  const lower = addr.toLowerCase();
  if (lower === '::' || lower === '::1') return true; // unspecified + loopback
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^fc/.test(lower) || /^fd/.test(lower)) return true; // fc00::/7 ULA
  // IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // unparseable → treat as unsafe
}

function assertSafeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > MAX_URL_LENGTH) {
    throw blocked('Invalid URL');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw blocked('Invalid URL');
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw blocked('Unsupported protocol');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    throw blocked('Blocked host');
  }
  return parsed;
}

async function assertSafeHost(url) {
  const host = url.hostname;
  const literal = net.isIP(host);
  if (literal === 4 || literal === 6) {
    if (isPrivateIp(host)) throw blocked('Resolved to private address');
    return;
  }

  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    // Dead/typo'd domain — treat like any other fetch failure so the caller
    // can fall back to a minimal preview instead of breaking the message.
    throw fetchFailed('Could not resolve host');
  }
  for (const { address } of records) {
    if (isPrivateIp(address)) throw blocked('Resolved to private address');
  }
}

// ────────────────────────────── Fetch ──────────────────────────────

async function readBodyLimited(res, limit) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > limit) break; // keep head only — OG tags live there
    size += value.byteLength;
    chunks.push(value);
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

async function fetchPageSafely(startUrl) {
  let current = startUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertSafeHost(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en',
        },
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw timedOut();
      throw fetchFailed(err?.message);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw fetchFailed('Redirect without location');
      const next = new URL(location, current);
      if (!['http:', 'https:'].includes(next.protocol.toLowerCase())) {
        throw blocked('Redirect to unsafe protocol');
      }
      current = next;
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      throw fetchFailed(`HTTP ${res.status}`);
    }

    const html = await readBodyLimited(res, MAX_BODY_BYTES);
    return { html, finalUrl: current };
  }

  throw fetchFailed('Too many redirects');
}

// ────────────────────────────── Metadata extraction ──────────────────────────────

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return m ? m[2] : null;
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return m;
      }
    })
    .replace(/&#(\d+);/g, (m, d) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return m;
      }
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (m) => {
      const map = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
        '&nbsp;': ' ',
      };
      return map[m.toLowerCase()] ?? m;
    });
}

const clean = (s) =>
  (s ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

function extractMeta(html) {
  const meta = {};
  const tagRe = /<meta\s[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    const prop = attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop');
    const content = attr(tag, 'content');
    if (prop && content != null) {
      const key = prop.toLowerCase();
      if (!(key in meta)) meta[key] = clean(decodeEntities(content));
    }
  }
  return meta;
}

function toAbsolute(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractIcon(html, baseUrl) {
  const m = html.match(
    /<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*>/i
  );
  if (m) {
    const href = attr(m[0], 'href');
    if (href) return toAbsolute(clean(decodeEntities(href)), baseUrl);
  }
  return null;
}

function extractOgMetadata(html, baseUrl) {
  const meta = extractMeta(html);

  const title =
    meta['og:title'] ||
    meta['twitter:title'] ||
    clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');

  const description =
    meta['og:description'] ||
    meta['twitter:description'] ||
    meta['description'] ||
    null;

  const image =
    meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || null;

  return {
    siteName: meta['og:site_name'] || meta['twitter:site'] || null,
    title,
    description,
    image: image ? toAbsolute(image, baseUrl) : null,
    type: meta['og:type'] || null,
    icon: extractIcon(html, baseUrl),
  };
}

// ────────────────────────────── YouTube ──────────────────────────────

function extractYouTubeId(url) {
  const host = url.hostname.toLowerCase();
  const isYouTube =
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host.endsWith('.youtube.com');
  if (!isYouTube) return null;

  if (host === 'youtu.be') {
    const m = url.pathname.match(/^\/([\w-]{6,})/);
    return m ? m[1] : null;
  }
  const v = url.searchParams.get('v');
  if (v && /^[\w-]{6,}$/.test(v)) return v;
  const m = url.pathname.match(/^\/(?:watch|shorts|embed|live|v)\/([\w-]{6,})/);
  return m ? m[1] : null;
}

function buildYouTubeFallback(url, videoId) {
  const domain = url.hostname.replace(/^www\./, '');
  return {
    url: url.toString(),
    canonicalUrl: url.toString(),
    provider: 'YouTube',
    domain,
    title: 'Watch on YouTube',
    description: null,
    image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    favicon: 'https://youtube.com/favicon.ico',
    type: 'video',
    videoId,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
  };
}

// ────────────────────────────── Preview building ──────────────────────────────

function buildMinimalPreview(url) {
  const domain = url.hostname.replace(/^www\./, '');
  return {
    url: url.toString(),
    canonicalUrl: url.toString(),
    provider: domain,
    domain,
    title: domain,
    description: null,
    image: null,
    favicon: `https://${domain}/favicon.ico`,
    type: null,
    videoId: null,
    embedUrl: null,
  };
}

function buildFullPreview({ inputUrl, finalUrl, meta, videoId }) {
  const domain = finalUrl.hostname.replace(/^www\./, '');
  const provider =
    meta.siteName?.replace(/^@/, '') ||
    (videoId ? 'YouTube' : null) ||
    domain;
  return {
    url: inputUrl.toString(),
    canonicalUrl: finalUrl.toString(),
    provider,
    domain,
    title: meta.title || provider,
    description: meta.description,
    image: meta.image,
    favicon: meta.icon || `https://${domain}/favicon.ico`,
    type: meta.type,
    videoId: videoId || null,
    embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : null,
  };
}

// ────────────────────────────── Cache ──────────────────────────────

function cacheKey(url) {
  return `linkpreview:${createHash('md5').update(url).digest('hex')}`;
}

async function cacheGet(key) {
  try {
    const raw = await getRedis().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttl) {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    /* cache is best-effort */
  }
}

// ────────────────────────────── Public API ──────────────────────────────

/**
 * Resolves a URL into normalized link-preview metadata.
 *
 * Returns a full preview when the page is reachable and exposes metadata, a
 * derived preview for YouTube, or a graceful minimal preview (domain + URL)
 * when fetching fails — never throws on provider errors. Throws only for
 * invalid/unsafe URLs.
 */
export async function getLinkPreview(rawUrl) {
  const url = assertSafeUrl(rawUrl);
  const normalized = url.toString();
  const key = cacheKey(normalized);

  const cached = await cacheGet(key);
  if (cached) return cached;

  const videoId = extractYouTubeId(url);

  let preview;
  let ttl = CACHE_TTL_FULL;

  try {
    const { html, finalUrl } = await fetchPageSafely(url);
    const meta = extractOgMetadata(html, finalUrl);
    preview = buildFullPreview({
      inputUrl: url,
      finalUrl,
      meta,
      videoId,
    });
    if (!meta.title) ttl = CACHE_TTL_FALLBACK;
  } catch (err) {
    if (err?.code === 'BLOCKED') throw err;
    if (videoId) {
      // YouTube page blocked/slow — derive everything we need locally.
      preview = buildYouTubeFallback(url, videoId);
    } else {
      // Provider unreachable or hid metadata (e.g. LinkedIn): show domain + URL.
      preview = buildMinimalPreview(url);
    }
    ttl = CACHE_TTL_FALLBACK;
  }

  await cacheSet(key, preview, ttl);
  return preview;
}
