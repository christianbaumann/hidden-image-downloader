import { escapeHtml, escapeMarkdown, markdownUrl } from './clubmail-content.js';
import { formatDate, formatTime, relativeUrl } from './transcript.js';

export const PROFILE_MARKDOWN_NAME = 'profile.md';
export const PROFILE_HTML_NAME = 'profile.html';
const UNKNOWN_OWNER = 'Unknown';
const TEXT_SECTIONS = [['motto', 'Motto'], ['description', 'About'], ['like', 'Likes'], ['dislike', 'Dislikes']];
const PARAGRAPH_TAG = /\[p\]([\s\S]*?)\[\/p\]/gi;
const PARAGRAPH_BREAK = /\n[^\S\n]*\n/;
const LINE_BREAK = /\n/g;
const LINE_START = /^/gm;
const HASHTAG_SIGN = /^#/;
// escapeMarkdown has already turned '[' and ']' into '\[' and '\]'.
// Spaces stay outside the markers, since '** x **' is no emphasis in Markdown.
const MARKDOWN_BOLD_TAG = /\\\[b\\\](\s*)([\s\S]*?)(\s*)\\\[\/b\\\]/gi;
const MARKDOWN_ITALIC_TAG = /\\\[i\\\](\s*)([\s\S]*?)(\s*)\\\[\/i\\\]/gi;
const HTML_BOLD_TAG = /\[b\]([\s\S]*?)\[\/b\]/gi;
const HTML_ITALIC_TAG = /\[i\]([\s\S]*?)\[\/i\]/gi;
const MARKDOWN_INDENT = '  ';

// [p]…[/p] and blank lines separate paragraphs.
function paragraphs(text) {
  return (text ?? '').replace(PARAGRAPH_TAG, '\n\n$1\n\n').split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

// JoyClub's BBCode ([p], [b], [i]) → Markdown; other tags and smiley codes stay escaped text.
export function profileTextToMarkdown(text) {
  return paragraphs(text)
    .map((paragraph) => escapeMarkdown(paragraph).replace(MARKDOWN_BOLD_TAG, '$1**$2**$3').replace(MARKDOWN_ITALIC_TAG, '$1*$2*$3'))
    .join('\n\n');
}

export function profileTextToHtml(text) {
  return paragraphs(text)
    .map((paragraph) => `<p>${escapeHtml(paragraph)
      .replace(HTML_BOLD_TAG, '<strong>$1</strong>')
      .replace(HTML_ITALIC_TAG, '<em>$1</em>')
      .replace(LINE_BREAK, '<br>\n')}</p>`)
    .join('\n');
}

function textSections(text) {
  return TEXT_SECTIONS.filter(([field]) => paragraphs(text?.[field]).length > 0);
}

function hashtagLine(hashtags) {
  return (hashtags ?? []).map((tag) => `#${tag.replace(HASHTAG_SIGN, '')}`).join(' ');
}

function photoCount(albums) {
  return albums.reduce((count, album) => count + album.photos.length, 0);
}

function fileName(file) {
  return file.split('/').at(-1);
}

function renderMarkdownPhoto({ file, title, description, hashtags }) {
  const lines = [`- [${escapeMarkdown(title || fileName(file))}](${markdownUrl(relativeUrl(file))})`];
  const details = [profileTextToMarkdown(description), escapeMarkdown(hashtagLine(hashtags))].filter(Boolean);
  for (const detail of details) lines.push(detail.replace(LINE_START, MARKDOWN_INDENT));
  return lines.join('\n');
}

// sedCard from toSedCard → [{ title, persons: [{ label, lines: [{ label, value }] }] }]: Steckbrief, then Vorlieben,
// each holding only the persons with something to show.
function sedCardSections(sedCard) {
  if (!sedCard) {
    return [];
  }
  const section = (title, linesOf) => ({
    title,
    persons: sedCard.persons.map((person) => ({ label: person.label, lines: linesOf(person) })).filter(({ lines }) => lines.length > 0),
  });
  return [
    section(sedCard.title, (person) => person.properties),
    section(sedCard.preferencesTitle, (person) => person.preferences.map(({ rating, items }) => ({ label: rating, value: items.join(', ') }))),
  ].filter(({ persons }) => persons.length > 0);
}

function renderMarkdownSedCard(sedCard) {
  const lines = [];
  for (const { title, persons } of sedCardSections(sedCard)) {
    lines.push('', `## ${escapeMarkdown(title)}`);
    for (const person of persons) {
      if (person.label) lines.push('', `### ${escapeMarkdown(person.label)}`);
      lines.push('', ...person.lines.map(({ label, value }) => `- **${escapeMarkdown(label)}:** ${escapeMarkdown(value)}`));
    }
  }
  return lines;
}

// owner: display name; text: { motto, description, like, dislike } or null (left out); sedCard: from toSedCard or null;
// albums: [{ title, description, photos: [{ file (relative to the ZIP's top folder), title, description, hashtags }] }].
export function renderProfileMarkdown({ owner, text, sedCard, albums, exportedAt }) {
  const lines = [
    `# ${escapeMarkdown(owner || UNKNOWN_OWNER)}`,
    `Exported ${formatDate(exportedAt)} ${formatTime(exportedAt)} · ${photoCount(albums)} photos`,
  ];
  const sections = textSections(text);
  if (sections.length > 0) {
    lines.push('', '## Profile text');
    for (const [field, label] of sections) lines.push('', `### ${label}`, '', profileTextToMarkdown(text[field]));
  }
  lines.push(...renderMarkdownSedCard(sedCard));
  lines.push('', '## Albums');
  for (const album of albums) {
    lines.push('', `### ${escapeMarkdown(album.title)}`);
    const description = profileTextToMarkdown(album.description);
    if (description) lines.push('', description);
    lines.push('', ...album.photos.map(renderMarkdownPhoto));
  }
  return `${lines.join('\n')}\n`;
}

const HTML_STYLE = `body { font-family: sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.4; }
.photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 1rem; }
figure { margin: 0; }
figure img { width: 100%; border-radius: 0.5rem; }
figcaption p { margin: 0.25rem 0; }
.hashtags { color: #555; }`;

function renderHtmlPhoto({ file, title, description, hashtags }) {
  const url = escapeHtml(relativeUrl(file));
  const caption = [
    ...(title ? [`<p><strong>${escapeHtml(title)}</strong></p>`] : []),
    ...(description ? [profileTextToHtml(description)] : []),
    ...(hashtags?.length ? [`<p class="hashtags">${escapeHtml(hashtagLine(hashtags))}</p>`] : []),
  ];
  return [
    '<figure>',
    `<a href="${url}"><img src="${url}" alt="${escapeHtml(title || fileName(file))}"></a>`,
    ...(caption.length > 0 ? [`<figcaption>\n${caption.join('\n')}\n</figcaption>`] : []),
    '</figure>',
  ].join('\n');
}

function renderHtmlSedCard(sedCard) {
  const lines = [];
  for (const { title, persons } of sedCardSections(sedCard)) {
    lines.push(`<h2>${escapeHtml(title)}</h2>`);
    for (const person of persons) {
      if (person.label) lines.push(`<h3>${escapeHtml(person.label)}</h3>`);
      lines.push('<ul>', ...person.lines.map(({ label, value }) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`), '</ul>');
    }
  }
  return lines;
}

// Same structure as renderProfileMarkdown; self-contained, every value escaped, images from the ZIP only.
export function renderProfileHtml({ owner, text, sedCard, albums, exportedAt }) {
  const title = escapeHtml(owner || UNKNOWN_OWNER);
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
    `<p>Exported ${formatDate(exportedAt)} ${formatTime(exportedAt)} · ${photoCount(albums)} photos</p>`,
  ];
  const sections = textSections(text);
  if (sections.length > 0) {
    lines.push('<h2>Profile text</h2>');
    for (const [field, label] of sections) lines.push(`<h3>${label}</h3>`, profileTextToHtml(text[field]));
  }
  lines.push(...renderHtmlSedCard(sedCard));
  lines.push('<h2>Albums</h2>');
  for (const album of albums) {
    lines.push(`<h3>${escapeHtml(album.title)}</h3>`);
    const description = profileTextToHtml(album.description);
    if (description) lines.push(description);
    lines.push('<div class="photos">', ...album.photos.map(renderHtmlPhoto), '</div>');
  }
  lines.push('</body>', '</html>');
  return `${lines.join('\n')}\n`;
}
