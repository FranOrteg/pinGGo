const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * Extracts the first http(s) URL from a text string.
 * Strips trailing punctuation while keeping balanced parentheses.
 * Returns null when there is no valid URL.
 */
export function extractFirstUrl(text) {
  if (!text) return null;
  const matches = text.match(URL_RE);
  if (!matches) return null;

  let url = matches[0];
  for (;;) {
    const last = url[url.length - 1];
    if (/[.,;:!?]/.test(last)) {
      url = url.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const opens = (url.match(/\(/g) || []).length;
      const closes = (url.match(/\)/g) || []).length;
      if (closes > opens) {
        url = url.slice(0, -1);
        continue;
      }
    }
    break;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    /* not a valid URL */
  }
  return null;
}
