const WEBP_EXTENSION = /\.webp$/i;
const JPG_EXTENSION = '.jpg';

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

const SRCSET_SEPARATOR = /\s*,(?:\s+|$)/;
const WIDTH_DESCRIPTOR = /^(\d+)w$/;
const USABLE_PROTOCOLS = ['http:', 'https:'];

// Largest `<url> <n>w` candidate, resolved against baseUrl; http(s) only; null if none.
export function largestSrcsetUrl(srcset, baseUrl) {
  let best = null;
  let bestWidth = -1;
  for (const candidate of (srcset ?? '').trim().split(SRCSET_SEPARATOR)) {
    const [url, descriptor, ...rest] = candidate.trim().split(/\s+/);
    const match = WIDTH_DESCRIPTOR.exec(descriptor ?? '');
    if (!match || rest.length > 0) continue;
    const width = Number(match[1]);
    if (width > bestWidth) {
      best = url;
      bestWidth = width;
    }
  }
  if (best === null) return null;
  let resolved;
  try {
    resolved = new URL(best, baseUrl);
  } catch {
    return null;
  }
  return USABLE_PROTOCOLS.includes(resolved.protocol) ? resolved.href : null;
}
