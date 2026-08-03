const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

// Strips trailing punctuation while keeping balanced parentheses,
// so "Visit https://example.com." highlights only the URL itself.
function stripTrailing(url) {
  let u = url;
  for (;;) {
    const last = u[u.length - 1];
    if (/[.,;:!?]/.test(last)) {
      u = u.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const opens = (u.match(/\(/g) || []).length;
      const closes = (u.match(/\)/g) || []).length;
      if (closes > opens) {
        u = u.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return u;
}

/**
 * Splits text into plain-text and URL segments for rendering/highlighting.
 * Returns an array of { type: 'text' | 'url', value }.
 */
export function splitByUrl(text) {
  if (!text) return [];
  const parts = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    const clean = stripTrailing(m[0]);
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    if (clean) parts.push({ type: 'url', value: clean });
    last = m.index + (clean ? clean.length : m[0].length);
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}
