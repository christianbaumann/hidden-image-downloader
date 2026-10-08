const WEBP_EXTENSION = /\.webp$/i;
const JPG_EXTENSION = '.jpg';
const USABLE_PROTOCOLS = ['http:', 'https:'];
const JPEG_MIME = 'image/jpeg';

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
