import { contentToMarkdown, contentToText, escapeMarkdown, markdownUrl } from './clubmail-content.js';

export const CONVERSATION_MARKDOWN_NAME = 'conversation.md';
const UNKNOWN_PARTNER = 'Unknown';
const REPLY_SNIPPET_LENGTH = 80;
const ELLIPSIS = '…';
const IMAGE_ALT = 'attachment';

function pad2(number) {
  return String(number).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function snippet(text) {
  const chars = Array.from(text);
  return chars.length > REPLY_SNIPPET_LENGTH ? `${chars.slice(0, REPLY_SNIPPET_LENGTH).join('').trimEnd()}${ELLIPSIS}` : text;
}

function renderReply({ author, time, content }) {
  const date = new Date(time);
  const text = escapeMarkdown(snippet(contentToText(content)));
  return `> Reply to ${escapeMarkdown(author)}, ${formatDate(date)} ${formatTime(date)}: ${text}`.trimEnd();
}

// Relative link to a file next to the transcript; the file name is one URL path segment.
function fileUrl(file) {
  return markdownUrl(encodeURIComponent(file));
}

function renderAttachment({ file, name, isImage }) {
  return isImage ? `![${IMAGE_ALT}](${fileUrl(file)})` : `[${escapeMarkdown(name)}](${fileUrl(file)})`;
}

function renderBody(message) {
  const blocks = [];
  if (message.reply) blocks.push(renderReply(message.reply));
  const text = contentToMarkdown(message.content);
  if (text) blocks.push(text);
  if (message.attachment) blocks.push(renderAttachment(message.attachment));
  return blocks.join('\n\n');
}

// messages from toClubMailConversation, in conversation order; times in local time.
export function renderConversationMarkdown({ partner, messages, exportedAt }) {
  const lines = [
    `# ClubMail with ${escapeMarkdown(partner || UNKNOWN_PARTNER)}`,
    `Exported ${formatDate(exportedAt)} ${formatTime(exportedAt)} · ${messages.length} messages`,
  ];
  let currentDay = null;
  for (const message of messages) {
    const time = new Date(message.time);
    const day = formatDate(time);
    if (day !== currentDay) {
      lines.push('', `## ${day}`);
      currentDay = day;
    }
    lines.push('', `**${escapeMarkdown(message.author)}** · ${formatTime(time)}`);
    const body = renderBody(message);
    if (body) lines.push(body);
  }
  return `${lines.join('\n')}\n`;
}
