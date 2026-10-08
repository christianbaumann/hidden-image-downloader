import { buildFilename } from './filename.js';
import { toJpgUrl } from './image-url.js';

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
const USABLE_PROTOCOLS = ['http:', 'https:'];

// Injected via chrome.scripting.executeScript: must stay self-contained.
export function extractLightboxData() {
  const img = document.querySelector('.lightbox_slide.slide_active img.secure_image');
  if (!img) {
    return null;
  }
  const slide = img.closest('.lightbox_slide');
  const text = (selector) => slide.querySelector(selector)?.textContent.trim() ?? '';
  const title = [text('.lb_img_title'), text('aside.lightbox_desktop_bild_titel'), img.alt.trim()]
    .find((candidate) => candidate !== '') ?? '';
  return {
    style: img.getAttribute('style'),
    title,
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
  let url;
  try {
    url = new URL(match[2], baseUrl);
  } catch {
    return null;
  }
  return USABLE_PROTOCOLS.includes(url.protocol) ? url.href : null;
}

// Preferred first: the server's jpg sibling, then the URL as served.
export function toDownloadCandidates(raw, date) {
  if (!raw) {
    throw new NoLightboxError();
  }
  const original = parseBackgroundImageUrl(raw.style, raw.pageUrl);
  if (!original) {
    throw new NoImageUrlError();
  }
  const jpg = toJpgUrl(original);
  const urls = jpg === original ? [original] : [jpg, original];
  return urls.map((url) => ({
    url,
    filename: buildFilename({ owner: raw.owner, title: raw.title, photoId: raw.photoId, url, date }),
  }));
}
