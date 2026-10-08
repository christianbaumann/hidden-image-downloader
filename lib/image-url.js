const WEBP_EXTENSION = /\.webp$/i;
const JPG_EXTENSION = '.jpg';
const SRCSET_SEPARATOR = /\s*,(?:\s+|$)/;
const WHITESPACE = /\s+/;
const WIDTH_DESCRIPTOR = /^(\d+)w$/;
const USABLE_PROTOCOLS = ['http:', 'https:'];

// https://…/image_1920_k.webp?cache=x → https://…/image_1920_k.jpg?cache=x; other URLs unchanged.
export function toJpgUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!WEBP_EXTENSION.test(parsed.pathname)) {
    return url;
  }
  parsed.pathname = parsed.pathname.replace(WEBP_EXTENSION, JPG_EXTENSION);
  return parsed.href;
}

// url resolved against baseUrl; http(s) only; null otherwise.
export function resolveHttpUrl(url, baseUrl) {
  let resolved;
  try {
    resolved = new URL(url, baseUrl);
  } catch {
    return null;
  }
  return USABLE_PROTOCOLS.includes(resolved.protocol) ? resolved.href : null;
}

// Largest `<url> <n>w` candidate, resolved against baseUrl; http(s) only; null if none.
// Candidates must be separated by a comma plus whitespace, so commas inside data: URLs survive.
export function largestSrcsetUrl(srcset, baseUrl) {
  let best = null;
  let bestWidth = -Infinity;
  for (const candidate of (srcset ?? '').trim().split(SRCSET_SEPARATOR)) {
    const [url, descriptor, ...rest] = candidate.trim().split(WHITESPACE);
    const match = WIDTH_DESCRIPTOR.exec(descriptor ?? '');
    if (!match || rest.length > 0) continue;
    const width = Number(match[1]);
    if (width > bestWidth) {
      best = url;
      bestWidth = width;
    }
  }
  return best === null ? null : resolveHttpUrl(best, baseUrl);
}
