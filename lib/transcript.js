import { contentToHtml, contentToMarkdown, contentToText, escapeHtml, escapeMarkdown, markdownUrl } from './clubmail-content.js';

export const CONVERSATION_MARKDOWN_NAME = 'conversation.md';
export const CONVERSATION_HTML_NAME = 'conversation.html';
const UNKNOWN_PARTNER = 'Unknown';
const REPLY_SNIPPET_LENGTH = 80;
const ELLIPSIS = '…';
const IMAGE_ALT = 'attachment';

function pad2(number) {
  return String(number).padStart(2, '0');
}

export function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function snippet(text) {
  const chars = Array.from(text);
  return chars.length > REPLY_SNIPPET_LENGTH ? `${chars.slice(0, REPLY_SNIPPET_LENGTH).join('').trimEnd()}${ELLIPSIS}` : text;
}

function replyLine({ author, time, content }, escape) {
  const date = new Date(time);
  return `Reply to ${escape(author)}, ${formatDate(date)} ${formatTime(date)}: ${escape(snippet(contentToText(content)))}`.trimEnd();
}

function renderReply(reply) {
  return `> ${replyLine(reply, escapeMarkdown)}`;
}

// Relative link to a file below the transcript's folder; each '/'-separated segment is encoded on its own.
export function relativeUrl(file) {
  return file.split('/').map(encodeURIComponent).join('/');
}

function fileUrl(file) {
  return markdownUrl(relativeUrl(file));
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

const HTML_STYLE = `body { font-family: sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.4; }
h2 { text-align: center; font-size: 1rem; color: #555; }
.message { width: fit-content; max-width: 80%; margin: 0.75rem auto 0.75rem 0; padding: 0.5rem 0.75rem; border-radius: 0.75rem; background: #eee; }
.message.own { margin: 0.75rem 0 0.75rem auto; background: #dbe8fb; }
.message p { margin: 0.25rem 0; }
.header { font-size: 0.9rem; }
blockquote { margin: 0.25rem 0 0.5rem; padding-left: 0.75rem; border-left: 3px solid #bbb; color: #555; }
img { max-width: 100%; border-radius: 0.5rem; }`;

function htmlFileUrl(file) {
  return escapeHtml(relativeUrl(file));
}

function renderHtmlAttachment({ file, name, isImage }) {
  return isImage
    ? `<p><img src="${htmlFileUrl(file)}" alt="${IMAGE_ALT}"></p>`
    : `<p><a href="${htmlFileUrl(file)}">${escapeHtml(name)}</a></p>`;
}

function renderHtmlMessage(message) {
  const lines = [
    `<div class="${message.isOwn ? 'message own' : 'message'}">`,
    `<p class="header"><strong>${escapeHtml(message.author)}</strong> · ${formatTime(new Date(message.time))}</p>`,
  ];
  if (message.reply) lines.push(`<blockquote>${replyLine(message.reply, escapeHtml)}</blockquote>`);
  const text = contentToHtml(message.content);
  if (text) lines.push(`<p>${text}</p>`);
  if (message.attachment) lines.push(renderHtmlAttachment(message.attachment));
  lines.push('</div>');
  return lines.join('\n');
}

// Same structure as renderConversationMarkdown; self-contained, every value escaped, only message links are remote.
export function renderConversationHtml({ partner, messages, exportedAt }) {
  const title = `ClubMail with ${escapeHtml(partner || UNKNOWN_PARTNER)}`;
  const lines = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>\n${HTML_STYLE}\n</style>`,
    '</head>',
    '<body>',
    `<h1>${title}</h1>`,
    `<p>Exported ${formatDate(exportedAt)} ${formatTime(exportedAt)} · ${messages.length} messages</p>`,
  ];
  let currentDay = null;
  for (const message of messages) {
    const day = formatDate(new Date(message.time));
    if (day !== currentDay) {
      lines.push(`<h2>${day}</h2>`);
      currentDay = day;
    }
    lines.push(renderHtmlMessage(message));
  }
  lines.push('</body>', '</html>');
  return `${lines.join('\n')}\n`;
}
