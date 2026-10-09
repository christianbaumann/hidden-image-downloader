import { buildFilename } from './filename.js';
import { resolveHttpUrl, toJpgUrl } from './image-url.js';
import { photoKey } from './profile.js';

export class NoLightboxError extends Error {
  name = 'NoLightboxError';
}

export class NoImageUrlError extends Error {
  name = 'NoImageUrlError';
}

export class UnsupportedPageError extends Error {
  name = 'UnsupportedPageError';
}

const BACKGROUND_IMAGE_URL = /background-image\s*:[^;]*?url\(\s*(["']?)(.*?)\1\s*\)/i;

// Injected via chrome.scripting.executeScript: must stay self-contained.
export function extractLightboxData() {
  const img = document.querySelector('.lightbox_slide.slide_active img.secure_image');
  if (!img) {
    return null;
  }
  const slide = img.closest('.lightbox_slide');
  const text = (selector) => slide.querySelector(selector)?.textContent.trim() ?? '';
  return {
    style: img.getAttribute('style'),
    owner: text('a.lb_owner_name'),
    photoId: img.dataset.photo ?? null,
    pageUrl: window.location.href,
  };
}

export function parseBackgroundImageUrl(style, baseUrl) {
  const match = BACKGROUND_IMAGE_URL.exec(style ?? '');
  if (!match || match[2] === '') {
    return null;
  }
  return resolveHttpUrl(match[2], baseUrl);
}

// raw: { style, owner, photoId, pageUrl, album?, position?, count? }.
export function toDownloadCandidates(raw) {
  if (!raw) {
    throw new NoLightboxError();
  }
  const original = parseBackgroundImageUrl(raw.style, raw.pageUrl);
  if (!original) {
    throw new NoImageUrlError();
  }
  return imageCandidates(original, raw);
}

// original: the image URL as served; names: { owner, photoId, album?, position?, count? }.
// Preferred first: the server's jpg sibling, then the URL as served; both share one stem.
export function imageCandidates(original, names) {
  const jpg = toJpgUrl(original);
  const urls = jpg === original ? [original] : [jpg, original];
  const { owner, album, position, count } = names;
  const photoId = photoKey(original) ?? names.photoId;
  return urls.map((url) => ({ url, filename: buildFilename({ owner, album, position, count, photoId, url }) }));
}
