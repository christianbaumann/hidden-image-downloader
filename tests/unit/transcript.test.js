import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConversationMarkdown } from '../../lib/transcript.js';

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
