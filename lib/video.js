import { entryNumber, photoStem, titleSegment } from './filename.js';
import { withReason } from './clubmail.js';

export const VIDEOS_FOLDER = 'Videos';
const VIDEO_EXTENSION = 'mp4';
const UNAVAILABLE_TEXT = 'Videos: unavailable';
const LOCKED_REASON = 'FSK18 locked';
// Same mapping as SIGNED_PARAMETERS in fetchProfileVideos, which cannot import it.
const SIGNED_PARAMETERS = {
  'CloudFront-Policy': 'Policy',
  'CloudFront-Signature': 'Signature',
  'CloudFront-Key-Pair-Id': 'Key-Pair-Id',
};

// /aws/aws_signed_cookies answer → signed-URL query; '' unless all three values are there.
export function signedQueryOf(answer) {
  const cookies = answer?.content?.cookie_list;
  const values = Object.keys(SIGNED_PARAMETERS).map((cookie) => cookies?.[cookie]);
  if (!values.every(Boolean)) {
    return '';
  }
  return new URLSearchParams(Object.values(SIGNED_PARAMETERS).map((parameter, index) => [parameter, values[index]])).toString();
}

// Injected via chrome.scripting.executeScript: must stay self-contained.
// → { videos: [{ id, source?, query?, signing?, title?, locked? }] } in JoyClub's order (newest first), or { failed: true, reason }; never throws.
// source: the HLS master playlist; query: its CloudFront signed-URL parameters (valid ~20 min, for this video only);
// signing: the absolute URL that answers fresh parameters, for a retry once they expired; title: media_title as served.
// A video without source (locked FSK18 session) keeps its place, so the others keep their numbers.
// Never calls /aws/track/watch, so no view is counted.
export async function fetchProfileVideos(userId) {
  const LIST_PATH = '/video/lightbox/list';
  const DATA_PATH = '/video/lightbox/data';
  const SIGNED_PATH = '/aws/aws_signed_cookies';
  const VIDEO_MEDIA_SOURCE = 4;
  const TIMEOUT_MS = 15000;
  const TIMEOUT_ERRORS = new Set(['TimeoutError', 'AbortError']);
  const SIGNED_PARAMETERS = {
    'CloudFront-Policy': 'Policy',
    'CloudFront-Signature': 'Signature',
    'CloudFront-Key-Pair-Id': 'Key-Pair-Id',
  };
  const ENTITIES = { '&quot;': '"', '&#039;': '\'', '&#39;': '\'', '&lt;': '<', '&gt;': '>', '&amp;': '&' };

  class HttpError extends Error {
    name = 'HttpError';
  }

  const fetchJson = async (path, options = {}) => {
    const response = await fetch(path, { credentials: 'include', ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status}`);
    }
    return response.json();
  };
  const cacheKiller = document.body?.dataset.cacheKiller;
  const post = (path, data) => fetchJson(path, {
    method: 'POST',
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    body: new URLSearchParams({ cache_killer: cacheKiller, data: JSON.stringify(data) }),
  });
  // JSON in an HTML attribute of media_html, e.g. data-video="{&quot;video_source&quot;:…}"; null when absent or broken.
  const attributeJson = (html, name) => {
    const match = new RegExp(`${name}="([^"]*)"`).exec(html ?? '');
    try {
      return match ? JSON.parse(match[1].replace(/&(?:quot|#0?39|lt|gt|amp);/g, (entity) => ENTITIES[entity])) : null;
    } catch {
      return null;
    }
  };
  const signingUrl = (config) => `${location.origin}${SIGNED_PATH}?mode=${encodeURIComponent(config.modus)}&payload=${encodeURIComponent(config.payload_json)}`;
  const signedQuery = async (signing) => {
    const cookies = (await fetchJson(signing))?.content?.cookie_list;
    const values = Object.keys(SIGNED_PARAMETERS).map((cookie) => cookies?.[cookie]);
    if (!values.every(Boolean)) {
      return '';
    }
    return new URLSearchParams(Object.values(SIGNED_PARAMETERS).map((parameter, index) => [parameter, values[index]])).toString();
  };
  const toVideo = async (id, item) => {
    const source = attributeJson(item?.media_html, 'data-video')?.video_source;
    const config = attributeJson(item?.media_html, 'data-cookie-config');
    if (!source || !config) {
      return { id, ...(item?.media_fsk18_blurred ? { locked: true } : {}) };
    }
    try {
      const signing = signingUrl(config);
      const query = await signedQuery(signing);
      const title = typeof item.media_title === 'string' && item.media_title ? { title: item.media_title } : {};
      return query ? { id, source, query, signing, ...title } : { id };
    } catch {
      return { id };
    }
  };

  if (!cacheKiller) {
    return { failed: true, reason: 'no session' };
  }
  try {
    const base = { media_set_id: 0, media_source: VIDEO_MEDIA_SOURCE, media_user_id: Number(userId) };
    const keys = (await post(LIST_PATH, base))?.content?.media_key_list;
    if (!Array.isArray(keys)) {
      return { failed: true, reason: 'bad response' };
    }
    const ids = keys.map((key) => String(key).split('_')[1]).filter((id) => /^\d+$/.test(id ?? ''));
    if (ids.length === 0) {
      return { videos: [] };
    }
    const items = (await post(DATA_PATH, { ...base, media_id_list: ids.map(Number) }))?.content?.lightbox_data_list ?? {};
    const videos = [];
    for (const id of ids) {
      videos.push(await toVideo(id, items[id]));
    }
    return { videos };
  } catch (error) {
    if (error?.name === 'HttpError') {
      return { failed: true, reason: error.message };
    }
    if (TIMEOUT_ERRORS.has(error?.name)) {
      return { failed: true, reason: 'timeout' };
    }
    return { failed: true, reason: error?.name === 'SyntaxError' ? 'bad response' : 'network error' };
  }
}

function unavailableLine(count, reason) {
  return count > 0 ? `${withReason(`Videos: ${count} not available`, reason)}\n` : '';
}

// raw = { videos } | { failed: true, reason? } from fetchProfileVideos, or undefined (videos not asked for).
// → { entries: [{ url, name: '<folder>/<owner>_<folder>_<NN>_<title>_<id>.mp4' (no title part without a usable title), videoId, hls: { query, signing } }], skipped: '<lines>' };
// numbered by position in JoyClub's list, so a video without source leaves a gap.
export function toVideoEntries(raw, owner, folder = VIDEOS_FOLDER) {
  if (!raw) {
    return { entries: [], skipped: '' };
  }
  if (!Array.isArray(raw.videos)) {
    return { entries: [], skipped: `${withReason(UNAVAILABLE_TEXT, raw.reason)}\n` };
  }
  const entries = raw.videos.flatMap((video, index) => {
    if (!video.source) {
      return [];
    }
    const number = entryNumber(index, raw.videos.length);
    const stem = photoStem({ owner, folder, number, title: titleSegment(video.title), key: video.id, extension: VIDEO_EXTENSION });
    const hls = { query: video.query ?? '', signing: video.signing ?? '' };
    return [{ url: video.source, name: `${folder}/${stem}.${VIDEO_EXTENSION}`, videoId: video.id, hls }];
  });
  const withoutSource = raw.videos.filter((video) => !video.source);
  const locked = withoutSource.filter((video) => video.locked).length;
  return {
    entries,
    skipped: unavailableLine(locked, LOCKED_REASON) + unavailableLine(withoutSource.length - locked),
  };
}

// skipped.txt line for videos whose stream the extension cannot read.
export function unsupportedVideosLine(count, reason) {
  return `${withReason(`Videos: ${count} not supported`, reason)}\n`;
}
