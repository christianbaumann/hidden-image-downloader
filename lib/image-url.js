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
