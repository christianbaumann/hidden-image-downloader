import {
  FALLBACK_FOLDER,
  UNKNOWN_OWNER,
  entryNumber,
  extensionFromUrl,
  folderSegment,
  formatTimestamp,
  reserveUniqueName,
  sanitizeSegment,
} from './filename.js';
import { CLUBMAIL_FOLDER, toClubMailConversation } from './clubmail.js';
import {
  CONVERSATION_HTML_NAME, CONVERSATION_MARKDOWN_NAME, renderConversationHtml, renderConversationMarkdown,
} from './transcript.js';
import { largestJpegUrl } from './image-url.js';

export class NothingToDownloadError extends Error {
  name = 'NothingToDownloadError';
}

export class AlbumApiError extends Error {
  name = 'AlbumApiError';
}

export const MISSING_REPORT_NAME = 'missing.txt';
export const SKIPPED_REPORT_NAME = 'skipped.txt';
export const MAIN_ALBUM_FALLBACK_TITLE = 'Hauptalbum';
const PROFILE_URL = /^https:\/\/www\.joyclub\.(?:de|com)\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?profile\/(?:(?:fotos|fotoalbum)\/)?(\d+)[.-]/;
const LIST_SUCCESS = 'ProfileAlbumListByUserIdSuccess';
const SOURCE_SUCCESS = 'ProfileAlbumImageSourceSuccessResult';
const RESTRICTED_ALBUM = 'ProfileRestrictedRegularAlbum';
const CLUBMAIL_UNAVAILABLE_LINE = 'ClubMail: unavailable\n';
const PHOTO_KEY_LENGTH = 8;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UUID path segment → first 8 chars; otherwise null.
export function photoKey(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const firstSegment = pathname.split('/')[1] ?? '';
  return UUID_SEGMENT.test(firstSegment) ? firstSegment.slice(0, PHOTO_KEY_LENGTH) : null;
}

// Injected via chrome.scripting.executeScript: must stay self-contained.
// → { owner, mainAlbumTitle, list, sources } or { failed: true }; never throws.
export async function fetchProfileAlbums(userId) {
  const TOKEN_PATH = '/webauth/access_token';
  const GRAPH_URL = 'https://apiv2.joyclub.com/graph/';
  const TIMEOUT_MS = 15000;
  // JoyClub renders the album cards late and shows a default label first, so the title must stay unchanged for a while.
  const TITLE_POLL_MS = 100;
  const TITLE_STABLE_MS = 500;
  const TITLE_WAIT_MS = 3000;
  const MAIN_ALBUM_HREF = /\/profile\/fotoalbum\/\d+\.[^/]*$/;
  const LIST_QUERY = `query getProfileAlbumList($id: ID!) { profileAlbum { listByUserId(id: $id) { __typename
    ... on ProfileAlbumListByUserIdSuccess { mainAlbum { userImageIdList }
      regularAlbumResultList { __typename
        ... on ProfileRestrictedRegularAlbum { id title imageCount }
        ... on ProfileUnrestrictedRegularAlbumInterface { id title userImageIdList } } } } } }`;
  const SOURCES_QUERY = `query getProfileAlbumImageSources($idList: [ID!]!) { profileAlbum { image { source {
    sourceByImageIdList(idList: $idList) { itemList { id result { __typename
      ... on ProfileAlbumImageSourceSuccessResult { source { sourceListJson } } } } } } } } }`;

  const fetchJson = async (url, options) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  };
  const graph = async (token, operationName, query, variables) => {
    const body = await fetchJson(GRAPH_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ operationName, query, variables }),
    });
    if (body.errors?.length) {
      throw new Error('GraphQL error');
    }
    return body.data;
  };

  const readMainTitle = () => Array.from(document.querySelectorAll('a.profile-album-card__link'))
    .find((card) => MAIN_ALBUM_HREF.test(card.getAttribute('href') ?? ''))
    ?.querySelector('.title')?.textContent.trim() ?? '';
  let albumsSettled = false;
  // Last title that stayed unchanged for TITLE_STABLE_MS; '' when none did within TITLE_WAIT_MS and the API calls.
  const stableMainTitle = async () => {
    const deadline = Date.now() + TITLE_WAIT_MS;
    let title = readMainTitle();
    let since = Date.now();
    while (Date.now() < deadline || !albumsSettled) {
      await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_MS));
      const current = readMainTitle();
      if (current !== title) {
        title = current;
        since = Date.now();
      } else if (title && Date.now() - since >= TITLE_STABLE_MS) {
        return title;
      }
    }
    return '';
  };
  const loadAlbums = async () => {
    const token = (await fetchJson(TOKEN_PATH, { credentials: 'include' }))?.content?.access_token;
    if (!token) {
      return null;
    }
    const list = (await graph(token, 'getProfileAlbumList', LIST_QUERY, { id: userId }))?.profileAlbum?.listByUserId;
    const ids = [
      ...(list?.mainAlbum?.userImageIdList ?? []),
      ...(list?.regularAlbumResultList ?? []).flatMap((album) => album.userImageIdList ?? []),
    ];
    const sources = ids.length === 0
      ? []
      : (await graph(token, 'getProfileAlbumImageSources', SOURCES_QUERY, { idList: ids }))
        ?.profileAlbum?.image?.source?.sourceByImageIdList?.itemList ?? [];
    return { list, sources };
  };

  try {
    const mainAlbumTitle = stableMainTitle();
    const albums = await loadAlbums().finally(() => { albumsSettled = true; });
    if (!albums) {
      return { failed: true };
    }
    return {
      mainAlbumTitle: await mainAlbumTitle,
      owner: document.querySelector('h1.profile-base-info__user-name')?.textContent.trim() ?? '',
      ...albums,
    };
  } catch {
    return { failed: true };
  }
}

// Profile, album-overview or album URL → user id string; otherwise null.
export function profileUserId(url) {
  return PROFILE_URL.exec(url ?? '')?.[1] ?? null;
}

function sourceUrls(sources) {
  const urls = new Map();
  for (const { id, result } of sources ?? []) {
    const url = result?.__typename === SOURCE_SUCCESS ? largestJpegUrl(result.source?.sourceListJson) : null;
    if (url) urls.set(id, url);
  }
  return urls;
}

function albumEntries(album, owner, urlById, taken) {
  const urls = (album.userImageIdList ?? []).map((id) => urlById.get(id)).filter(Boolean);
  if (urls.length === 0) {
    return [];
  }
  const folder = reserveUniqueName(folderSegment(album.title) || FALLBACK_FOLDER, taken);
  return urls.map((url, index) => {
    const number = entryNumber(index, urls.length);
    const key = photoKey(url);
    const stem = key ? `${owner}_${folder}_${number}_${key}` : `${owner}_${folder}_${number}`;
    return { url, name: `${folder}/${stem}.${extensionFromUrl(url)}` };
  });
}

// raw = { failed?, owner, mainAlbumTitle, list, sources } from fetchProfileAlbums;
// clubMail = { origin, messages } | { failed: true } from fetchClubMailImages, or undefined.
// → { zipName, entries: [{ url, name: '<folder>/<owner>_<folder>_<NN>_<key>.jpg' }], reports: [{ name, text }], clubMailFailed };
// reports hold skipped.txt and the ClubMail transcripts (md, html) when there are messages.
export function toAlbumZipRequest(raw, date, clubMail) {
  if (!raw || raw.failed || raw.list?.__typename !== LIST_SUCCESS) {
    throw new AlbumApiError();
  }
  const mainAlbum = {
    title: raw.mainAlbumTitle || MAIN_ALBUM_FALLBACK_TITLE,
    userImageIdList: raw.list.mainAlbum?.userImageIdList,
  };
  const albums = [mainAlbum, ...(raw.list.regularAlbumResultList ?? [])];
  const restricted = albums.filter((album) => album.__typename === RESTRICTED_ALBUM);
  const owner = sanitizeSegment(raw.owner) || UNKNOWN_OWNER;
  const urlById = sourceUrls(raw.sources);
  const taken = new Set([MISSING_REPORT_NAME, SKIPPED_REPORT_NAME, CLUBMAIL_FOLDER.toLowerCase()]);
  const clubMailFailed = Boolean(clubMail) && !Array.isArray(clubMail.messages);
  const conversation = clubMail && !clubMailFailed ? toClubMailConversation(clubMail, owner, CLUBMAIL_FOLDER) : null;
  const entries = [
    ...albums
      .filter((album) => album.__typename !== RESTRICTED_ALBUM)
      .flatMap((album) => albumEntries(album, owner, urlById, taken)),
    ...(conversation?.entries ?? []),
  ];
  if (entries.length === 0) {
    throw new NothingToDownloadError();
  }
  const skipped = skippedReport(restricted) + (clubMailFailed ? CLUBMAIL_UNAVAILABLE_LINE : '');
  const reports = [
    ...(skipped ? [{ name: SKIPPED_REPORT_NAME, text: skipped }] : []),
    ...transcriptReports(conversation?.messages ?? [], raw.owner?.trim(), date),
  ];
  return { zipName: `${owner}_${formatTimestamp(date)}.zip`, entries, reports, clubMailFailed };
}

function transcriptReports(messages, partner, date) {
  if (messages.length === 0) {
    return [];
  }
  const conversation = { partner, messages, exportedAt: date };
  return [
    { name: `${CLUBMAIL_FOLDER}/${CONVERSATION_MARKDOWN_NAME}`, text: renderConversationMarkdown(conversation) },
    { name: `${CLUBMAIL_FOLDER}/${CONVERSATION_HTML_NAME}`, text: renderConversationHtml(conversation) },
  ];
}

// One line per restricted album: '<title> (<n> photos)\n'.
export function skippedReport(albums) {
  return albums.map((album) => `${(album.title ?? '').trim()} (${album.imageCount} photos)\n`).join('');
}

// One URL per line, trailing newline.
export function missingReport(urls) {
  return urls.map((url) => `${url}\n`).join('');
}
