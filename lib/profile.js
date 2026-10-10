import {
  FALLBACK_FOLDER,
  PLACEHOLDER_TITLES,
  UNKNOWN_OWNER,
  entryNumber,
  extensionFromUrl,
  folderSegment,
  photoStem,
  reserveUniqueName,
  sanitizeSegment,
  titleSegment,
} from './filename.js';
import { CLUBMAIL_FOLDER, clubMailPartnerName, toClubMailConversation, withReason } from './clubmail.js';
import {
  CONVERSATION_HTML_NAME, CONVERSATION_MARKDOWN_NAME, renderConversationHtml, renderConversationMarkdown,
} from './transcript.js';
import { largestJpegUrl } from './image-url.js';
import { fingerprint } from './incremental.js';
import { PROFILE_HTML_NAME, PROFILE_MARKDOWN_NAME, renderProfileHtml, renderProfileMarkdown } from './profile-report.js';
import { sedCardData, toSedCard } from './sed-card.js';
import { VIDEOS_FOLDER, toVideoEntries } from './video.js';

export class NothingToDownloadError extends Error {
  name = 'NothingToDownloadError';
}

export class AlbumApiError extends Error {
  name = 'AlbumApiError';
}

export class ClubMailApiError extends Error {
  name = 'ClubMailApiError';

  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

export const MISSING_REPORT_NAME = 'missing.txt';
export const SKIPPED_REPORT_NAME = 'skipped.txt';
export const MAIN_ALBUM_FALLBACK_TITLE = 'Hauptalbum';
const PROFILE_URL = /^https:\/\/www\.joyclub\.(?:de|com)\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?profile\/(?:(?:fotos|fotoalbum)\/)?(\d+)[.-]/;
const LIST_SUCCESS = 'ProfileAlbumListByUserIdSuccess';
const SOURCE_SUCCESS = 'ProfileAlbumImageSourceSuccessResult';
const RESTRICTED_ALBUM = 'ProfileRestrictedRegularAlbum';
const CAPTION_SUCCESS = 'ProfileAlbumImageItemResultSuccess';
const HASHTAGS_SUCCESS = 'ProfileAlbumImageHashtagsSuccessResult';
const PROFILE_DESCRIPTION = 'ProfileDescription';
const DESCRIPTION = 'Description';
const PROFILE_TEXT_FIELDS = ['motto', 'description', 'like', 'dislike'];
const CLUBMAIL_UNAVAILABLE_TEXT = 'ClubMail: unavailable';
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
// → { owner, mainAlbumTitle, list, sources, captions, profileText, sedCard, pageLanguage, profileGender } or { failed: true };
// never throws. captions, profileText and sedCard are null when their request fails, so a missing text never fails the ZIP.
// profileGender: the universal gender code of the profile header's gender icon, null when there is none.
export async function fetchProfileAlbums(userId) {
  const TOKEN_PATH = '/webauth/access_token';
  const GRAPH_URL = 'https://apiv2.joyclub.com/graph/';
  const TIMEOUT_MS = 15000;
  // JoyClub renders the album cards late and shows a default label first, so the title must stay unchanged for a while.
  const TITLE_POLL_MS = 100;
  const TITLE_STABLE_MS = 500;
  const TITLE_WAIT_MS = 3000;
  const MAIN_ALBUM_HREF = /\/profile\/fotoalbum\/\d+\.[^/]*$/;
  const ALBUM_PAGE_PATH = /\/profile\/fotoalbum\//;
  const ALBUM_HEADLINE = '.profile-album-detail-page h2.profile-headline';
  const LIST_QUERY = `query getProfileAlbumList($id: ID!) { profileAlbum { listByUserId(id: $id) { __typename
    ... on ProfileAlbumListByUserIdSuccess { mainAlbum { userImageIdList }
      regularAlbumResultList { __typename
        ... on ProfileRestrictedRegularAlbum { id title imageCount restrictionReason }
        ... on ProfileUnrestrictedRegularAlbumInterface { id title description userImageIdList } } } } } }`;
  const SOURCES_QUERY = `query getProfileAlbumImageSources($idList: [ID!]!) { profileAlbum { image { source {
    sourceByImageIdList(idList: $idList) { itemList { id result { __typename
      ... on ProfileAlbumImageSourceSuccessResult { source { sourceListJson } } } } } } } } }`;
  const CAPTIONS_QUERY = `query getProfileAlbumImageCaptions($idList: [ID!]!) { profileAlbum { image {
    byIdList(idList: $idList) { itemList { id result { __typename
      ... on ProfileAlbumImageItemResultSuccess { title description } } } }
    hashtag { byImageIdList(idList: $idList) { itemList { id result { __typename
      ... on ProfileAlbumImageHashtagsSuccessResult { hashtags } } } } } } } }`;
  const DESCRIPTION_QUERY = `query getProfileDescriptionByUserId($userId: Int!) { profileDescription { byUserId(userId: $userId) { __typename
    ... on ProfileDescription { description { __typename
      ... on BaseError { message }
      ... on Description { motto description like dislike } } }
    ... on ProfileByUserIdErrorResponse { errors { __typename ... on BaseError { message } } } } } }`;

  const SED_CARD_PROPERTIES = 'height weight smoker children hairColor eyeColor appearance bodySize cupSize clothSize shoeSize hasBirthdayToday zodiacSign';
  const SED_CARD_QUERY = `query getProfileSedCardDataByUserId($userId: Int!) { profileDescription { byUserId(userId: $userId) { __typename
    ... on ProfileDescription {
      properties { __typename ... on BaseError { message }
        ... on UserProperties { individualProperties { ${SED_CARD_PROPERTIES} } individualPropertiesPartner { ${SED_CARD_PROPERTIES} } } }
      interests { ... on Interests { individualInterests { ds sm sexualOrientation } individualInterestsPartner { ds sm sexualOrientation } } }
      preferences { ... on UserPreferences { primaryPreferences { key rating } partnerPreferences { key rating } } } }
    ... on ProfileByUserIdErrorResponse { errors { __typename ... on BaseError { message } } } } } }`;
  const GENDER_ICON = '.profile-base-info__line-1 j-gender-icon[universal-gender]';

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
  // Album pages have no album cards. The main album page names its album in the headline, which JoyClub renders
  // 0.2–0.5 s after load (the own profile's sidebar shows an "Account" headline earlier); a regular album page names
  // only its own album.
  const readHeadline = () => document.querySelector(ALBUM_HEADLINE)?.textContent.trim() ?? '';
  const headlineTitle = async () => {
    while (!readHeadline() && !albumsSettled) {
      await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_MS));
    }
    return readHeadline();
  };
  const mainTitle = () => {
    if (MAIN_ALBUM_HREF.test(location.pathname)) {
      return headlineTitle();
    }
    return ALBUM_PAGE_PATH.test(location.pathname) ? '' : stableMainTitle();
  };
  const loadCaptions = (token, ids) => graph(token, 'getProfileAlbumImageCaptions', CAPTIONS_QUERY, { idList: ids })
    .then((data) => data?.profileAlbum?.image ?? null, () => null);
  const loadProfileText = (token) => graph(token, 'getProfileDescriptionByUserId', DESCRIPTION_QUERY, { userId: Number(userId) })
    .then((data) => data?.profileDescription?.byUserId ?? null, () => null);
  const loadSedCard = (token) => graph(token, 'getProfileSedCardDataByUserId', SED_CARD_QUERY, { userId: Number(userId) })
    .then((data) => data?.profileDescription?.byUserId ?? null, () => null);
  const readGender = () => {
    const gender = Number.parseInt(document.querySelector(GENDER_ICON)?.getAttribute('universal-gender'), 10);
    return Number.isInteger(gender) ? gender : null;
  };
  const loadAlbumList = async (token) => {
    const list = (await graph(token, 'getProfileAlbumList', LIST_QUERY, { id: userId }))?.profileAlbum?.listByUserId;
    const ids = [
      ...(list?.mainAlbum?.userImageIdList ?? []),
      ...(list?.regularAlbumResultList ?? []).flatMap((album) => album.userImageIdList ?? []),
    ];
    if (ids.length === 0) {
      return { list, sources: [], captions: null };
    }
    const [sources, captions] = await Promise.all([
      graph(token, 'getProfileAlbumImageSources', SOURCES_QUERY, { idList: ids })
        .then((data) => data?.profileAlbum?.image?.source?.sourceByImageIdList?.itemList ?? []),
      loadCaptions(token, ids),
    ]);
    return { list, sources, captions };
  };
  const loadAlbums = async () => {
    const token = (await fetchJson(TOKEN_PATH, { credentials: 'include' }))?.content?.access_token;
    if (!token) {
      return null;
    }
    const [albums, profileText, sedCard] = await Promise.all([loadAlbumList(token), loadProfileText(token), loadSedCard(token)]);
    return { ...albums, profileText, sedCard };
  };

  try {
    const mainAlbumTitle = mainTitle();
    const albums = await loadAlbums().finally(() => { albumsSettled = true; });
    if (!albums) {
      return { failed: true };
    }
    return {
      mainAlbumTitle: await mainAlbumTitle,
      owner: document.querySelector('h1.profile-base-info__user-name')?.textContent.trim() ?? '',
      ...albums,
      pageLanguage: document.documentElement?.lang ?? '',
      profileGender: readGender(),
    };
  } catch {
    return { failed: true };
  }
}

// Injected via chrome.scripting.executeScript: must stay self-contained.
// → the raw title of one photo ('' when it has none), or null when any request fails; never throws.
export async function fetchPhotoTitle(photoId) {
  const TOKEN_PATH = '/webauth/access_token';
  const GRAPH_URL = 'https://apiv2.joyclub.com/graph/';
  const TIMEOUT_MS = 15000;
  const CAPTION_SUCCESS = 'ProfileAlbumImageItemResultSuccess';
  const CAPTIONS_QUERY = `query getProfileAlbumImageCaptions($idList: [ID!]!) { profileAlbum { image {
    byIdList(idList: $idList) { itemList { id result { __typename
      ... on ProfileAlbumImageItemResultSuccess { title } } } } } } }`;

  const fetchJson = async (url, options) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  };
  try {
    const token = (await fetchJson(TOKEN_PATH, { credentials: 'include' }))?.content?.access_token;
    if (!token) {
      return null;
    }
    const body = await fetchJson(GRAPH_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ operationName: 'getProfileAlbumImageCaptions', query: CAPTIONS_QUERY, variables: { idList: [photoId] } }),
    });
    const result = body?.data?.profileAlbum?.image?.byIdList?.itemList
      ?.find((item) => String(item.id) === String(photoId))?.result;
    return result?.__typename === CAPTION_SUCCESS ? result.title ?? '' : null;
  } catch {
    return null;
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

// captions = profileAlbum.image of the captions query, or null → Map id → { title, description, hashtags }.
function captionsById(captions) {
  const byId = new Map();
  for (const { id, result } of captions?.byIdList?.itemList ?? []) {
    if (result?.__typename !== CAPTION_SUCCESS) continue;
    const title = (result.title ?? '').trim();
    byId.set(id, { title: PLACEHOLDER_TITLES.has(title) ? '' : title, description: result.description ?? '', hashtags: [] });
  }
  for (const { id, result } of captions?.hashtag?.byImageIdList?.itemList ?? []) {
    if (result?.__typename !== HASHTAGS_SUCCESS || !Array.isArray(result.hashtags)) continue;
    const hashtags = result.hashtags.filter((tag) => typeof tag === 'string');
    byId.set(id, { title: '', description: '', ...byId.get(id), hashtags });
  }
  return byId;
}

// profileDescription.byUserId → { motto, description, like, dislike }; null for an error answer or a failed request.
function profileTextOf(raw) {
  if (raw?.__typename !== PROFILE_DESCRIPTION || raw.description?.__typename !== DESCRIPTION) {
    return null;
  }
  return Object.fromEntries(PROFILE_TEXT_FIELDS.map((field) => [field, raw.description[field] ?? '']));
}

// Numbered by album position, so a photo without source leaves a gap and the others keep the number the album page shows.
// captions: Map id → { title } from captionsById. → [{ id, entry }]
function albumEntries(album, owner, urlById, captions, taken) {
  const urls = (album.userImageIdList ?? []).map((id) => urlById.get(id));
  if (!urls.some(Boolean)) {
    return [];
  }
  const folder = reserveUniqueName(folderSegment(album.title) || FALLBACK_FOLDER, taken);
  return urls.flatMap((url, index) => {
    if (!url) {
      return [];
    }
    const id = album.userImageIdList[index];
    const number = entryNumber(index, urls.length);
    const key = photoKey(url);
    const title = titleSegment(captions.get(id)?.title);
    const extension = extensionFromUrl(url);
    const stem = photoStem({ owner, folder, number, title, key, extension });
    const entry = { url, name: `${folder}/${stem}.${extension}`, ...(key ? { photoKey: key } : {}) };
    return [{ id, entry }];
  });
}

// savedAlbums: [{ album, photos: [{ id, entry }] }]; photo links use the full-ZIP names, also in an incremental ZIP.
function profileReports(raw, text, sedCard, savedAlbums, captions, date) {
  const profile = {
    owner: raw.owner?.trim(),
    text,
    sedCard: toSedCard(sedCard, { language: raw.pageLanguage, gender: raw.profileGender }),
    albums: savedAlbums.map(({ album, photos }) => ({
      title: (album.title ?? '').trim(),
      description: album.description ?? '',
      photos: photos.map(({ id, entry }) => ({ file: entry.name, ...captions.get(id) })),
    })),
    exportedAt: date,
  };
  return [
    { name: PROFILE_MARKDOWN_NAME, text: renderProfileMarkdown(profile) },
    { name: PROFILE_HTML_NAME, text: renderProfileHtml(profile) },
  ];
}

// raw = { failed?, owner, mainAlbumTitle, list, sources, captions, profileText, sedCard, pageLanguage, profileGender }
// from fetchProfileAlbums;
// clubMail = { origin, partnerId?, messages } | { failed: true, reason? } from fetchClubMailImages, or undefined.
// videos = { videos } | { failed: true, reason? } from fetchProfileVideos, or undefined.
// → { zipName, entries: [{ url, name: '<folder>/<owner>_<folder>_<NN>_<title>_<key>.jpg', photoKey? } | video entry | ClubMail entry],
//     reports: [{ name, text }], clubMailFailed, clubMailReason, videosFailed, videosReason, lastMessageId?, profileTextHash? };
// reports hold skipped.txt, the ClubMail transcripts (md, html) when there are messages, then profile.md and profile.html.
// profileTextHash fingerprints the profile text and the sed card; none when neither could be read.
export function toAlbumZipRequest(raw, date, clubMail, videos) {
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
  const captions = captionsById(raw.captions);
  const taken = new Set([
    MISSING_REPORT_NAME, SKIPPED_REPORT_NAME, PROFILE_MARKDOWN_NAME, PROFILE_HTML_NAME, CLUBMAIL_FOLDER.toLowerCase(),
    VIDEOS_FOLDER.toLowerCase(),
  ]);
  const clubMailFailed = Boolean(clubMail) && !Array.isArray(clubMail.messages);
  const clubMailReason = clubMailFailed ? clubMail.reason : undefined;
  const conversation = clubMail && !clubMailFailed ? toClubMailConversation(clubMail, owner, CLUBMAIL_FOLDER) : null;
  const savedAlbums = albums
    .filter((album) => album.__typename !== RESTRICTED_ALBUM)
    .map((album) => ({ album, photos: albumEntries(album, owner, urlById, captions, taken) }))
    .filter(({ photos }) => photos.length > 0);
  const video = toVideoEntries(videos, owner);
  const entries = [
    ...savedAlbums.flatMap(({ photos }) => photos.map(({ entry }) => entry)),
    ...video.entries,
    ...(conversation?.entries ?? []),
  ];
  if (entries.length === 0) {
    throw new NothingToDownloadError();
  }
  const text = profileTextOf(raw.profileText);
  const sedCard = sedCardData(raw.sedCard);
  const skipped = skippedReport(restricted) + video.skipped + (clubMailFailed ? `${withReason(CLUBMAIL_UNAVAILABLE_TEXT, clubMailReason)}\n` : '');
  const reports = [
    ...(skipped ? [{ name: SKIPPED_REPORT_NAME, text: skipped }] : []),
    ...transcriptReports(conversation?.messages ?? [], raw.owner?.trim(), date),
    ...profileReports(raw, text, sedCard, savedAlbums, captions, date),
  ];
  return {
    zipName: `${owner}.zip`,
    entries,
    reports,
    clubMailFailed,
    clubMailReason,
    videosFailed: Boolean(videos) && !Array.isArray(videos.videos),
    videosReason: Array.isArray(videos?.videos) ? undefined : videos?.reason,
    ...lastMessageIdOf(clubMail),
    ...profileTextHashOf(text, sedCard),
  };
}

// Without a sed card the input stays the text fields alone, so the hash of earlier exports still matches.
function profileTextHashOf(text, sedCard) {
  const textValues = text ? PROFILE_TEXT_FIELDS.map((field) => text[field]) : null;
  const input = sedCard ? [textValues, sedCard] : textValues;
  return input ? { profileTextHash: fingerprint(JSON.stringify(input)) } : {};
}

// raw = { origin, partnerId, messages } | { failed: true, reason? } from fetchClubMailImages.
// → { zipName: '<partner>_ClubMail.zip', entries, reports, lastMessageId } holding the ClubMail folder only.
export function toClubMailZipRequest(raw, date) {
  if (!Array.isArray(raw?.messages)) {
    throw new ClubMailApiError(raw?.reason);
  }
  if (raw.messages.length === 0) {
    throw new NothingToDownloadError();
  }
  const partner = clubMailPartnerName(raw);
  const owner = sanitizeSegment(partner) || UNKNOWN_OWNER;
  const { entries, messages } = toClubMailConversation(raw, owner, CLUBMAIL_FOLDER);
  return {
    zipName: `${owner}_${CLUBMAIL_FOLDER}.zip`,
    entries,
    reports: transcriptReports(messages, partner, date),
    ...lastMessageIdOf(raw),
  };
}

// { lastMessageId } of the newest message (messages are oldest first); {} without messages.
function lastMessageIdOf(clubMail) {
  const id = clubMail?.messages?.at(-1)?.id;
  return id === undefined || id === null ? {} : { lastMessageId: String(id) };
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

// ': <reason>' with JoyClub's raw restrictionReason; empty without one.
function reasonSuffix(reason) {
  const text = reason?.trim();
  return text ? `: ${text}` : '';
}

// One line per restricted album: '<title> (<n> photos)[: <restrictionReason>]\n'.
export function skippedReport(albums) {
  return albums.map((album) => `${(album.title ?? '').trim()} (${album.imageCount} photos)${reasonSuffix(album.restrictionReason)}\n`).join('');
}

// One URL per line, trailing newline.
export function missingReport(urls) {
  return urls.map((url) => `${url}\n`).join('');
}
