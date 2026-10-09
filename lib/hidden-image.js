import { resolveHttpUrl } from './image-url.js';
import { NoImageUrlError, imageCandidates } from './lightbox.js';

const CSS_URL = /url\(\s*(["']?)(.*?)\1\s*\)/i;
const SRCSET_SEPARATOR = ',';
const DESCRIPTOR_SEPARATOR = /\s+/;
const DEFAULT_DESCRIPTOR_SIZE = 1;
const ALBUM_PAGE_PATH = /^\/profile\/fotoalbum\//;
const ALBUM_LINK_PHOTO_ID = /#media_id_\d+_(\d+)_/;
const NOT_FOUND = -1;

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

// raw (content.js): { pageUrl, owner, album, albumLinks, layers: [{ backgroundImage, srcset, photoId, linkIndex, owner }] },
// layers topmost first. The first layer with a background image or a srcset is the image below the overlay.
export function toHiddenImageCandidates(raw) {
  for (const layer of raw?.layers ?? []) {
    const url = backgroundImageUrl(layer.backgroundImage, raw.pageUrl) ?? widestSrcsetUrl(layer.srcset, raw.pageUrl);
    if (url) {
      return imageCandidates(url, {
        owner: layer.owner || raw.owner,
        photoId: layer.photoId ?? null,
        ...albumContext(raw, layer),
      });
    }
  }
  throw new NoImageUrlError();
}
