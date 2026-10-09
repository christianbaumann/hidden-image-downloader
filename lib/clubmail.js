import { entryNumber, sanitizeSegment } from './filename.js';

export const CLUBMAIL_FOLDER = 'ClubMail';
const CONVERSATION_PREFIX = 'conversation-wrapper-personal-';
const DOWNLOAD_PATH = '/clubmailv3/attachment/download/';
const ATTACHMENT_EXTENSION = /^\.?([a-z0-9]{1,5})$/i;
const FALLBACK_ATTACHMENT_EXTENSION = 'bin';

// JoyClub puts the higher user id first; the other order finds no messages.
export function clubMailConversationId(ownId, partnerId) {
  const [high, low] = [String(ownId), String(partnerId)].sort((a, b) => Number(b) - Number(a));
  return `${CONVERSATION_PREFIX}${high}-${low}`;
}

// Injected via chrome.scripting.executeScript: must stay self-contained.
// → { origin, messages } (oldest first) or { failed: true }; never throws.
export async function fetchClubMailImages(partnerId) {
  const LIST_PATH = '/clubmailv3/get_latest_message_list_of_conversation';
  const PAGE_LIMIT = 100;
  const TIMEOUT_MS = 15000;
  const ownId = document.body?.dataset.sessionUserId;
  const cacheKiller = document.body?.dataset.cacheKiller;
  if (!ownId || !cacheKiller) {
    return { failed: true };
  }
  // Same rule as clubMailConversationId, which this function cannot import.
  const [high, low] = [ownId, String(partnerId)].sort((a, b) => Number(b) - Number(a));
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
        return { failed: true };
      }
      const content = (await response.json())?.content;
      if (!Array.isArray(content?.message_list)) {
        return { failed: true };
      }
      pages.unshift(content.message_list);
      data = content.page_up_parameter ?? null;
    }
  } catch {
    return { failed: true };
  }
  return { origin: location.origin, messages: pages.flat() };
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

// raw = { origin, messages } from fetchClubMailImages; owner is already sanitised.
// → [{ url, name: '<folder>/<owner>_<folder>_<NN>_<attach_id>.<ext>' }], in message order.
export function toClubMailEntries(raw, owner, folder) {
  const messages = raw.messages.filter((message) => message.has_attachment && message.attachment?.attach_id);
  return messages.map((message, index) => {
    const number = entryNumber(index, messages.length);
    const id = sanitizeSegment(message.attachment.attach_id);
    const extension = attachmentExtension(message.attachment.file_type);
    return { url: downloadUrl(raw.origin, message), name: `${folder}/${owner}_${folder}_${number}_${id}.${extension}` };
  });
}
