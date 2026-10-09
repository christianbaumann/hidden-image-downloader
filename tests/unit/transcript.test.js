import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConversationHtml, renderConversationMarkdown } from '../../lib/transcript.js';

const EXPORTED_AT = new Date(2026, 9, 9, 14, 2);
const at = (day, hour, minute) => new Date(2026, 8, day, hour, minute).getTime();
const message = (overrides) => ({ author: 'TestOwner', time: at(30, 21, 14), content: '', reply: null, attachment: null, ...overrides });
const render = (messages, partner = 'TestOwner') => renderConversationMarkdown({ partner, messages, exportedAt: EXPORTED_AT });

describe('renderConversationMarkdown', () => {
  test('renders title, export line, day headings and author · time per message', () => {
    const markdown = render([
      message({ content: 'Hi<br />there' }),
      message({ author: 'TestMe', time: at(30, 21, 20), content: 'Hello' }),
      message({ time: new Date(2026, 9, 1, 8, 5).getTime(), content: 'Morning' }),
    ]);

    assert.equal(markdown, [
      '# ClubMail with TestOwner',
      'Exported 2026-10-09 14:02 · 3 messages',
      '',
      '## 2026-09-30',
      '',
      '**TestOwner** · 21:14',
      'Hi\nthere',
      '',
      '**TestMe** · 21:20',
      'Hello',
      '',
      '## 2026-10-01',
      '',
      '**TestOwner** · 08:05',
      'Morning',
      '',
    ].join('\n'));
  });

  test('a reply starts with "> Reply to <author>, <time>: <snippet>"', () => {
    const reply = { author: 'TestMe', time: at(30, 21, 10), content: 'Hi <a href="https://x">you</a>' };
    const markdown = render([message({ content: 'Answer', reply })]);

    assert.match(markdown, /\*\*TestOwner\*\* · 21:14\n> Reply to TestMe, 2026-09-30 21:10: Hi you\n\nAnswer\n/);
  });

  test('shortens a long reply snippet to 80 characters plus an ellipsis', () => {
    const reply = { author: 'TestMe', time: at(30, 21, 10), content: 'x'.repeat(100) };
    const markdown = render([message({ reply })]);

    assert.match(markdown, new RegExp(`: ${'x'.repeat(80)}…\n`));
  });

  test('an image attachment shows inline, another file as a link, both relative', () => {
    const markdown = render([
      message({ attachment: { file: 'TestOwner_ClubMail_01_a1.jpg', name: 'beach.jpg', isImage: true } }),
      message({ attachment: { file: 'Max_(B)_ClubMail_02_a2.pdf', name: 'plan.pdf', isImage: false } }),
    ]);

    assert.match(markdown, /· 21:14\n!\[attachment\]\(TestOwner_ClubMail_01_a1\.jpg\)\n/);
    assert.match(markdown, /· 21:14\n\[plan\.pdf\]\(Max_%28B%29_ClubMail_02_a2\.pdf\)\n$/);
  });

  test('escapes Markdown in partner, author, reply and attachment names', () => {
    const reply = { author: '*Bold*', time: at(30, 21, 10), content: '[x](https://evil)' };
    const markdown = render([
      message({ author: '_Me_', reply, attachment: { file: 'Club#1_ClubMail_01_a1.pdf', name: '[doc].pdf', isImage: false } }),
    ], '# Partner');

    assert.match(markdown, /^# ClubMail with \\# Partner\n/);
    assert.match(markdown, /\*\*\\_Me\\_\*\* · 21:14\n/);
    assert.match(markdown, /> Reply to \\\*Bold\\\*, 2026-09-30 21:10: \\\[x\\\]\(https:\/\/evil\)\n/);
    assert.match(markdown, /\[\\\[doc\\\]\.pdf\]\(Club%231_ClubMail_01_a1\.pdf\)\n$/);
  });

  test('text and attachment of one message are separate blocks', () => {
    const markdown = render([message({ content: 'Look', attachment: { file: 'f.jpg', name: 'f.jpg', isImage: true } })]);

    assert.match(markdown, /Look\n\n!\[attachment\]\(f\.jpg\)\n$/);
  });

  test('a message without body shows only its header', () => {
    assert.match(render([message({})]), /\*\*TestOwner\*\* · 21:14\n$/);
  });

  test('a missing partner name gives "Unknown"', () => {
    assert.match(render([message({})], ''), /^# ClubMail with Unknown\n/);
  });
});

const renderHtml = (messages, partner = 'TestOwner') => renderConversationHtml({ partner, messages, exportedAt: EXPORTED_AT });
const REMOTE_URL = /(?:src|href)\s*=\s*"(?:https?:)?\/\//gi;

describe('renderConversationHtml', () => {
  test('renders title, export line, day headings and author · time per message', () => {
    const html = renderHtml([
      message({ content: 'Hi<br />there' }),
      message({ author: 'TestMe', time: at(30, 21, 20), content: 'Hello' }),
      message({ time: new Date(2026, 9, 1, 8, 5).getTime(), content: 'Morning' }),
    ]);

    assert.match(html, /^<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n/);
    assert.match(html, /<title>ClubMail with TestOwner<\/title>\n<style>\n[^<]+<\/style>/);
    assert.match(html, /<h1>ClubMail with TestOwner<\/h1>\n<p>Exported 2026-10-09 14:02 · 3 messages<\/p>\n<h2>2026-09-30<\/h2>\n/);
    assert.match(html, /<p class="header"><strong>TestOwner<\/strong> · 21:14<\/p>\n<p>Hi<br>there<\/p>\n<\/div>\n/);
    assert.match(html, /<strong>TestMe<\/strong> · 21:20<\/p>\n<p>Hello<\/p>\n<\/div>\n<h2>2026-10-01<\/h2>\n/);
    assert.match(html, /<strong>TestOwner<\/strong> · 08:05<\/p>\n<p>Morning<\/p>\n<\/div>\n<\/body>\n<\/html>\n$/);
  });

  test('own messages get the class own, all others not', () => {
    const html = renderHtml([message({ content: 'Theirs' }), message({ author: 'TestMe', isOwn: true, content: 'Mine' })]);

    assert.deepEqual([...html.matchAll(/<div class="([^"]+)">/g)].map(([, name]) => name), ['message', 'message own']);
    assert.match(html, /\.message\.own \{[^}]*margin: [^;]* auto;/);
  });

  test('a reply is a blockquote before the text', () => {
    const reply = { author: 'TestMe', time: at(30, 21, 10), content: 'Hi <a href="https://x">you</a>' };
    const html = renderHtml([message({ content: 'Answer', reply })]);

    assert.match(html, /· 21:14<\/p>\n<blockquote>Reply to TestMe, 2026-09-30 21:10: Hi you<\/blockquote>\n<p>Answer<\/p>\n/);
  });

  test('an image attachment is an <img>, another file a link, both relative', () => {
    const html = renderHtml([
      message({ attachment: { file: 'TestOwner_ClubMail_01_a1.jpg', name: 'beach.jpg', isImage: true } }),
      message({ attachment: { file: 'Max_(B)_ClubMail_02_a#2.pdf', name: 'plan.pdf', isImage: false } }),
    ]);

    assert.match(html, /<p><img src="TestOwner_ClubMail_01_a1\.jpg" alt="attachment"><\/p>/);
    assert.match(html, /<p><a href="Max_\(B\)_ClubMail_02_a%232\.pdf">plan\.pdf<\/a><\/p>/);
  });

  test('escapes <script>, quotes and & in text, partner, author, reply and file names', () => {
    const reply = { author: '<b>"Me"</b>', time: at(30, 21, 10), content: '&lt;script&gt;x&lt;/script&gt;' };
    const html = renderHtml([
      message({
        author: `O'Neil & <script>a()</script>`,
        content: '&lt;script&gt;alert(&quot;1&quot;)&lt;/script&gt; &amp;',
        reply,
        attachment: { file: `x"onerror="a()'.pdf`, name: '<img src=x onerror=a()>.pdf', isImage: false },
      }),
    ], '<script>p()</script>');

    assert.doesNotMatch(html, /<script|<img src=x|<b>/);
    assert.match(html, /<title>ClubMail with &lt;script&gt;p\(\)&lt;\/script&gt;<\/title>/);
    assert.match(html, /<strong>O&#39;Neil &amp; &lt;script&gt;a\(\)&lt;\/script&gt;<\/strong>/);
    assert.match(html, /<p>&lt;script&gt;alert\(&quot;1&quot;\)&lt;\/script&gt; &amp;<\/p>/);
    assert.match(html, /<blockquote>Reply to &lt;b&gt;&quot;Me&quot;&lt;\/b&gt;, 2026-09-30 21:10: &lt;script&gt;x&lt;\/script&gt;<\/blockquote>/);
    assert.match(html, /<a href="x%22onerror%3D%22a\(\)&#39;\.pdf">&lt;img src=x onerror=a\(\)&gt;\.pdf<\/a>/);
  });

  test('loads no remote resource; only message links point to a remote URL', () => {
    const smiley = '<img class="joy_smiley" src="//cfnimg.joyclub.de/smile/a.gif" alt=":-)">';
    const html = renderHtml([
      message({ content: `${smiley} <img src="https://evil/p.gif"> <a href="javascript:x()">j</a> <a href="https://example.com">site</a>` }),
      message({ attachment: { file: 'f.jpg', name: 'f.jpg', isImage: true } }),
    ]);

    assert.deepEqual(html.match(REMOTE_URL), ['href="https://']);
    assert.match(html, /<p>:-\) {2}j <a href="https:\/\/example\.com">site<\/a><\/p>/);
    assert.doesNotMatch(html, /<link|@import|url\(/);
  });

  test('a message without body shows only its header', () => {
    assert.match(renderHtml([message({})]), /<strong>TestOwner<\/strong> · 21:14<\/p>\n<\/div>\n/);
  });

  test('a missing partner name gives "Unknown"', () => {
    assert.match(renderHtml([message({})], ''), /<h1>ClubMail with Unknown<\/h1>/);
  });
});
