import { resolveHttpUrl } from './image-url.js';
import { NoImageUrlError, imageCandidates } from './lightbox.js';

const CSS_URL = /url\(\s*(["']?)(.*?)\1\s*\)/i;
const SRCSET_SEPARATOR = ',';
const DESCRIPTOR_SEPARATOR = /\s+/;
const DEFAULT_DESCRIPTOR_SIZE = 1;
const ALBUM_PAGE_PATH = /^\/profile\/fotoalbum\//;
const ALBUM_LINK_PHOTO_ID = /#media_id_\d+_(\d+)_/;
const NOT_FOUND = -1;
const GIF_PATH = /\.gif$/i;
const CSS_RGB = /^rgba?\(([^)]*)\)$/i;
const RGB_ARGUMENT_SEPARATOR = /[\s,/]+/;
const ALPHA_INDEX = 3;
const OPAQUE_ALPHA = 1;
const TRANSPARENT_ALPHA = 0;
// A lightbox or modal backdrop dims the page well beyond a hover tint over a photo.
const BACKDROP_MIN_ALPHA = 0.6;

// Computed background-color (rgb/rgba) → its alpha; anything else counts as transparent.
export function colorAlpha(value) {
  const match = CSS_RGB.exec((value ?? '').trim());
  if (!match) {
    return TRANSPARENT_ALPHA;
  }
  const alpha = match[1].split(RGB_ARGUMENT_SEPARATOR).filter(Boolean)[ALPHA_INDEX];
  return alpha === undefined ? OPAQUE_ALPHA : Number.parseFloat(alpha);
}

// Computed background-image value → its first url(), resolved; null for 'none' or non-http(s).
export function backgroundImageUrl(value, baseUrl) {
  const match = CSS_URL.exec(value ?? '');
  return match && match[2] !== '' ? resolveHttpUrl(match[2], baseUrl) : null;
}

// srcset → URL of the candidate with the largest w or x descriptor, resolved; null when empty.
export function widestSrcsetUrl(srcset, baseUrl) {
  let widest = null;
  for (const candidate of (srcset ?? '').split(SRCSET_SEPARATOR)) {
    const [url, descriptor] = candidate.trim().split(DESCRIPTOR_SEPARATOR);
    const size = Number.parseFloat(descriptor) || DEFAULT_DESCRIPTOR_SIZE;
    const resolved = url ? resolveHttpUrl(url, baseUrl) : null;
    if (resolved && (!widest || size > widest.size)) {
      widest = { url: resolved, size };
    }
  }
  return widest?.url ?? null;
}

// Album title, 1-based position and count; only album pages (/profile/fotoalbum/…) list their photos in order.
// The layer's own album link wins; a lightbox image is found among the links by its photo id.
export function albumContext({ pageUrl, album, albumLinks = [] }, { linkIndex = NOT_FOUND, photoId }) {
  let pathname;
  try {
    pathname = new URL(pageUrl).pathname;
  } catch {
    return {};
  }
  if (!album || !ALBUM_PAGE_PATH.test(pathname)) {
    return {};
  }
  const index = linkIndex !== NOT_FOUND
    ? linkIndex
    : albumLinks.findIndex((href) => photoId && ALBUM_LINK_PHOTO_ID.exec(href ?? '')?.[1] === photoId);
  return index === NOT_FOUND ? {} : { album, position: index + 1, count: albumLinks.length };
}

// img src → its URL, resolved; null for data URIs, non-http(s) and GIFs (the transparent overlays).
export function plainImageUrl(src, baseUrl) {
  const url = src ? resolveHttpUrl(src, baseUrl) : null;
  return url && !GIF_PATH.test(new URL(url).pathname) ? url : null;
}

// raw (content.js): { pageUrl, owner, album, albumLinks,
//   layers: [{ backgroundImage, backgroundColor, srcset, src, photoId, linkIndex, owner, userName }] },
// layers topmost first. The first layer with a background image, a srcset or a non-GIF src is the image below the overlay;
// a backdrop (a layer without image and with a nearly opaque background colour) hides everything below it.
export function toHiddenImageCandidates(raw) {
  for (const layer of raw?.layers ?? []) {
    const url = backgroundImageUrl(layer.backgroundImage, raw.pageUrl) ?? widestSrcsetUrl(layer.srcset, raw.pageUrl)
      ?? plainImageUrl(layer.src, raw.pageUrl);
    if (url) {
      return imageCandidates(url, {
        owner: layer.owner || layer.userName || raw.owner,
        photoId: layer.photoId ?? null,
        ...albumContext(raw, layer),
      });
    }
    if (colorAlpha(layer.backgroundColor) >= BACKDROP_MIN_ALPHA) {
      break;
    }
  }
  throw new NoImageUrlError();
}
