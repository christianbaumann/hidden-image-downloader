// ClubMail message `content` is HTML; this allowlist converter needs no DOM, so it runs in the service worker.
const TOKEN = /<[^>]*>|[^<]+|</g;
const BR_TAG = /^<br\b/i;
const IMG_TAG = /^<img\b/i;
// JoyClub writes some links, e.g. album notices, as <j-a href>.
const A_OPEN_TAG = /^<(?:a|j-a)\b/i;
const A_CLOSE_TAG = /^<\/(?:a|j-a)\s*>$/i;
const SMILEY_CLASS = /(?:^|\s)joy_smiley(?:\s|$)/;
const SAFE_LINK = /^https?:\/\//i;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  euro: '€', hellip: '…', ndash: '–', mdash: '—', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
};
const MAX_CODE_POINT = 0x10ffff;
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const WHITESPACE_RUN = /\s+/g;
const MARKDOWN_URL_UNSAFE = /[\s()<>]/g;
const MARKDOWN_SPECIAL = /[\\`*_[\]<>]/g;
const MARKDOWN_BLOCK_MARKER = /^(\s*)(#+|[+-])(?=\s|$)/gm;
const MARKDOWN_LIST_NUMBER = /^(\s*)(\d+)([.)])(?=\s|$)/gm;
const LINK_LINE_BREAK = ' ';
const HTML_SPECIAL = /[&<>"']/g;
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function decodeEntities(text) {
  return text.replace(ENTITY, (match, code) => {
    if (!code.startsWith('#')) {
      return NAMED_ENTITIES[code] ?? NAMED_ENTITIES[code.toLowerCase()] ?? match;
    }
    const isHex = code[1].toLowerCase() === 'x';
    const point = parseInt(code.slice(isHex ? 2 : 1), isHex ? HEX_RADIX : DECIMAL_RADIX);
    return point <= MAX_CODE_POINT ? String.fromCodePoint(point) : match;
  });
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : null;
}

// format = { text(decoded), lineBreak, link(text, href) }; any tag but <br>, smiley <img> and <a>/<j-a> is dropped.
function convert(html, format) {
  let output = '';
  let link = null;
  const emit = (part) => {
    if (link) link.text += part;
    else output += part;
  };
  for (const [token] of (html ?? '').matchAll(TOKEN)) {
    if (!token.startsWith('<') || token === '<') {
      emit(format.text(decodeEntities(token)));
    } else if (BR_TAG.test(token)) {
      emit(link ? LINK_LINE_BREAK : format.lineBreak);
    } else if (IMG_TAG.test(token) && SMILEY_CLASS.test(attribute(token, 'class') ?? '')) {
      emit(format.text(attribute(token, 'alt') ?? ''));
    } else if (A_OPEN_TAG.test(token)) {
      const outerText = link?.text ?? '';
      link = null;
      emit(outerText);
      link = { href: attribute(token, 'href') ?? '', text: '' };
    } else if (A_CLOSE_TAG.test(token) && link) {
      const { href, text } = link;
      link = null;
      emit(SAFE_LINK.test(href) ? format.link(text, href) : text);
    }
  }
  return (output + (link?.text ?? '')).trim();
}

// Keeps a link destination intact in Markdown: spaces, parentheses and angle brackets are percent-encoded.
export function markdownUrl(url) {
  return url.replace(MARKDOWN_URL_UNSAFE, (char) => encodeURIComponent(char).replace('(', '%28').replace(')', '%29'));
}

// Text from other users must not become Markdown syntax (links, images, headings, raw HTML).
export function escapeMarkdown(text) {
  return text
    .replace(MARKDOWN_SPECIAL, '\\$&')
    .replace(MARKDOWN_BLOCK_MARKER, '$1\\$2')
    .replace(MARKDOWN_LIST_NUMBER, '$1$2\\$3');
}

export function contentToMarkdown(html) {
  const markdown = convert(html, {
    text: (text) => text.replace(MARKDOWN_SPECIAL, '\\$&'),
    lineBreak: '\n',
    link: (text, href) => `[${text || escapeMarkdown(href)}](${markdownUrl(href)})`,
  });
  return markdown.replace(MARKDOWN_BLOCK_MARKER, '$1\\$2').replace(MARKDOWN_LIST_NUMBER, '$1$2\\$3');
}

// Text from other users must not become markup; safe in element content and quoted attributes.
export function escapeHtml(text) {
  return text.replace(HTML_SPECIAL, (char) => HTML_ESCAPES[char]);
}

export function contentToHtml(html) {
  return convert(html, {
    text: escapeHtml,
    lineBreak: '<br>',
    link: (text, href) => `<a href="${escapeHtml(href)}">${text || escapeHtml(href)}</a>`,
  });
}

// One line of plain text, links reduced to their text; for reply snippets.
export function contentToText(html) {
  return convert(html, { text: (text) => text, lineBreak: ' ', link: (text, href) => text || href })
    .replace(WHITESPACE_RUN, ' ');
}
