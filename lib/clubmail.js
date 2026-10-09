import { UNKNOWN_OWNER, entryNumber, sanitizeSegment } from './filename.js';

export const CLUBMAIL_FOLDER = 'ClubMail';
const CONVERSATION_PREFIX = 'conversation-wrapper-personal-';
const DOWNLOAD_PATH = '/clubmailv3/attachment/download/';
const ATTACHMENT_EXTENSION = /^\.?([a-z0-9]{1,5})$/i;
const FALLBACK_ATTACHMENT_EXTENSION = 'bin';
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const UNKNOWN_AUTHOR = 'Unknown';
const OWN_FOLDER = 'Own';
const CONVERSATION_URL = /^https:\/\/www\.joyclub\.(?:de|com)\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?clubmail\/conversation\/conversation-wrapper-personal-(\d+)-(\d+)(?:[/?#]|$)/;

// ClubMail conversation URL → both user ids in URL order; otherwise null.
export function clubMailConversationIds(url) {
  const match = CONVERSATION_URL.exec(url ?? '');
  return match ? [match[1], match[2]] : null;
}

// JoyClub puts the higher user id first; the other order finds no messages.
export function clubMailConversationId(ownId, partnerId) {
  const [high, low] = [String(ownId), String(partnerId)].sort((a, b) => Number(b) - Number(a));
  return `${CONVERSATION_PREFIX}${high}-${low}`;
}

// Injected via chrome.scripting.executeScript: must stay self-contained.
// userIds: the profile's id, or both ids of a conversation URL; the own id is dropped.
// → { origin, ownId, partnerId, messages } (oldest first), { origin, messages: [] } on the own profile,
//   or { failed: true, reason }; never throws.
export async function fetchClubMailImages(userIds) {
  const LIST_PATH = '/clubmailv3/get_latest_message_list_of_conversation';
  const PAGE_LIMIT = 100;
  const TIMEOUT_MS = 15000;
  const NO_SESSION = 'no session';
  const NOT_YOUR_CONVERSATION = 'not your conversation';
  const BAD_RESPONSE = 'bad response';
  const TIMEOUT = 'timeout';
  const NETWORK_ERROR = 'network error';
  const TIMEOUT_ERRORS = new Set(['TimeoutError', 'AbortError']);
  const ownId = document.body?.dataset.sessionUserId;
  const cacheKiller = document.body?.dataset.cacheKiller;
  // Without the own id both ids of a conversation stay partners, so the session is checked first.
  if (!ownId || !cacheKiller) {
    return { failed: true, reason: NO_SESSION };
  }
  const partnerIds = userIds.map(String).filter((id) => id !== ownId);
  if (partnerIds.length > 1) {
    return { failed: true, reason: NOT_YOUR_CONVERSATION };
  }
  if (partnerIds.length === 0) {
    return { origin: location.origin, messages: [] };
  }
  const [partnerId] = partnerIds;
  // Same rule as clubMailConversationId, which this function cannot import.
  const [high, low] = [ownId, partnerId].sort((a, b) => Number(b) - Number(a));
  let data = {
    conversation_id: `conversation-wrapper-personal-${high}-${low}`,
    offset_message_id: null,
    limit_before: PAGE_LIMIT,
    limit_after: PAGE_LIMIT,
    inclusive: false,
    allow_blank_personal: true,
  };
  // Each page is oldest → newest; page_up_parameter leads to the next older page.
  const pages = [];
  try {
    while (data) {
      const response = await fetch(LIST_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        body: new URLSearchParams({ cache_killer: cacheKiller, data: JSON.stringify(data) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        return { failed: true, reason: `HTTP ${response.status}` };
      }
      const content = (await response.json())?.content;
      if (!Array.isArray(content?.message_list)) {
        return { failed: true, reason: BAD_RESPONSE };
      }
      pages.unshift(content.message_list);
      data = content.page_up_parameter ?? null;
    }
  } catch (error) {
    if (TIMEOUT_ERRORS.has(error?.name)) {
      return { failed: true, reason: TIMEOUT };
    }
    return { failed: true, reason: error?.name === 'SyntaxError' ? BAD_RESPONSE : NETWORK_ERROR };
  }
  return { origin: location.origin, ownId, partnerId, messages: pages.flat() };
}

// 'ClubMail unavailable' + ' (<reason>)' when there is one.
export function withReason(text, reason) {
  return reason ? `${text} (${reason})` : text;
}

function attachmentExtension(fileType) {
  return ATTACHMENT_EXTENSION.exec(fileType ?? '')?.[1].toLowerCase() ?? FALLBACK_ATTACHMENT_EXTENSION;
}

function downloadUrl(origin, message) {
  const query = new URLSearchParams({
    attachment_id: message.attachment.attach_id,
    conversation_sample_id: message.conversation_sample_id,
    message_id: message.id,
  });
  return `${origin}${DOWNLOAD_PATH}?${query}`;
}

function authorName(message) {
  return message?.from_user_name?.trim() || message?.from_user?.name?.trim() || UNKNOWN_AUTHOR;
}

// First author name found on the messages of userId; '' when none carries one.
function firstAuthorName(messages, userId) {
  return messages
    .filter((message) => String(message.from_user_id) === String(userId))
    .map(authorName)
    .find((name) => name !== UNKNOWN_AUTHOR) ?? '';
}

export function clubMailPartnerName({ partnerId, messages }) {
  return firstAuthorName(messages, partnerId);
}

function hasAttachment(message) {
  return Boolean(message.has_attachment && message.attachment?.attach_id);
}

function isOwnMessage(message, ownId) {
  return ownId !== undefined && String(message.from_user_id) === String(ownId);
}

// raw = { origin, ownId, messages } from fetchClubMailImages; owner is already sanitised.
// → { entries: [{ url, name: '<folder>/[Own/]<prefix>_<folder>_<NN>_<attach_id>.<ext>' }],
//     messages: [{ author, isOwn, time, content, reply: { author, time, content } | null, attachment: { file, name, isImage } | null }] },
// both in message order; attachment.file is the entry name relative to <folder>.
// Own attachments go to Own/ with the own name as prefix, the others use owner; each folder is numbered on its own.
export function toClubMailConversation(raw, owner, folder) {
  const withAttachment = raw.messages.filter(hasAttachment);
  const ownName = sanitizeSegment(firstAuthorName(raw.messages, raw.ownId)) || UNKNOWN_OWNER;
  const attachments = new Map();
  const addGroup = (group, prefix, directory) => group.forEach((message, index) => {
    const id = sanitizeSegment(message.attachment.attach_id);
    const extension = attachmentExtension(message.attachment.file_type);
    const name = `${prefix}_${folder}_${entryNumber(index, group.length)}_${id}.${extension}`;
    attachments.set(message, {
      file: directory ? `${directory}/${name}` : name,
      name: message.attachment.file_name || name,
      isImage: IMAGE_EXTENSIONS.has(extension),
    });
  });
  addGroup(withAttachment.filter((message) => isOwnMessage(message, raw.ownId)), ownName, OWN_FOLDER);
  addGroup(withAttachment.filter((message) => !isOwnMessage(message, raw.ownId)), owner, '');
  const entries = withAttachment.map((message) => ({ url: downloadUrl(raw.origin, message), name: `${folder}/${attachments.get(message).file}` }));
  const messages = raw.messages.map((message) => ({
    author: authorName(message),
    isOwn: isOwnMessage(message, raw.ownId),
    time: message.create_time_ms,
    content: message.content ?? '',
    reply: message.referred_message
      ? { author: authorName(message.referred_message), time: message.referred_message.create_time_ms, content: message.referred_message.content ?? '' }
      : null,
    attachment: attachments.get(message) ?? null,
  }));
  return { entries, messages };
}
