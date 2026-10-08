const WEBP_EXTENSION = /\.webp$/i;
const JPG_EXTENSION = '.jpg';
const LEADING_SEPARATORS = /^[\s,]+/;
const NON_WHITESPACE_RUN = /^\S+/;
const TRAILING_COMMAS = /,+$/;
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

// HTML srcset grammar: a URL is a whitespace-free run (commas inside data: URLs survive);
// its descriptors end at the next comma, so `a 1920w,b 240w` needs no space after the comma.
function* srcsetCandidates(srcset) {
  let rest = srcset;
  while ((rest = rest.replace(LEADING_SEPARATORS, ''))) {
    const url = NON_WHITESPACE_RUN.exec(rest)[0];
    rest = rest.slice(url.length);
    if (TRAILING_COMMAS.test(url)) {
      yield { url: url.replace(TRAILING_COMMAS, ''), descriptors: [] };
      continue;
    }
    const end = rest.indexOf(',');
    const descriptors = end === -1 ? rest : rest.slice(0, end);
    rest = end === -1 ? '' : rest.slice(end + 1);
    yield { url, descriptors: descriptors.trim().split(WHITESPACE).filter(Boolean) };
  }
}

// Largest `<url> <n>w` candidate, resolved against baseUrl; http(s) only; null if none.
export function largestSrcsetUrl(srcset, baseUrl) {
  let best = null;
  let bestWidth = -Infinity;
  for (const { url, descriptors } of srcsetCandidates(srcset ?? '')) {
    const match = descriptors.length === 1 ? WIDTH_DESCRIPTOR.exec(descriptors[0]) : null;
    if (!match) {
      continue;
    }
    const width = Number(match[1]);
    if (width > bestWidth) {
      best = url;
      bestWidth = width;
    }
  }
  return best === null ? null : resolveHttpUrl(best, baseUrl);
}
