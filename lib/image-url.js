const WEBP_EXTENSION = /\.webp$/i;
const JPG_EXTENSION = '.jpg';
const USABLE_PROTOCOLS = ['http:', 'https:'];
const JPEG_MIME = 'image/jpeg';
// /<uuid>/<variant>/image_<width>_<token>.<ext>: JoyClub serves crops (1-1) and widths of one photo under one token.
const SIZED_IMAGE_PATH = /^\/([0-9a-f-]{36})\/([^/]+)\/image_(\d+)_(\w+)\.(?:jpe?g|webp)$/i;
const FULL_SIZE_VARIANT = 'orig';
const FULL_SIZE_WIDTH = 1920;
// FSK18 pixelation: the full size of such a photo has another token.
const PIXELATED_TOKEN = /^pxl_/;

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

// A smaller or cropped JoyClub image → URL of the full-size jpg of the same photo (no cache query); null for
// full-size images, pixelated FSK18 variants and other URLs. The full size may not exist: callers probe it.
export function toFullSizeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = SIZED_IMAGE_PATH.exec(parsed.pathname);
  if (!match) {
    return null;
  }
  const [, uuid, variant, width, token] = match;
  if ((variant === FULL_SIZE_VARIANT && Number(width) >= FULL_SIZE_WIDTH) || PIXELATED_TOKEN.test(token)) {
    return null;
  }
  return `${parsed.origin}/${uuid}/${FULL_SIZE_VARIANT}/image_${FULL_SIZE_WIDTH}_${token}${JPG_EXTENSION}`;
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

// sourceListJson from JoyClub's GraphQL → widest jpeg URL (http/s), or null.
export function largestJpegUrl(sourceListJson) {
  let sources;
  try {
    sources = JSON.parse(sourceListJson);
  } catch {
    return null;
  }
  const jpeg = Array.isArray(sources) ? sources.find((source) => source?.mimeType === JPEG_MIME) : null;
  const widest = (jpeg?.sourceSet ?? []).reduce((best, item) => (best && best.width >= item.width ? best : item), null);
  return widest ? resolveHttpUrl(widest.path) : null;
}
