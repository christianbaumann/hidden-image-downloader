import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  profileTextToHtml, profileTextToMarkdown, renderProfileHtml, renderProfileMarkdown,
} from '../../lib/profile-report.js';

const DATE = new Date(2026, 9, 9, 10, 5, 0);
const FILE = 'Fotos von uns/Test (Owner)_Fotos von uns_01_00000001.jpg';
const FILE_URL = 'Fotos%20von%20uns/Test%20(Owner)_Fotos%20von%20uns_01_00000001.jpg';
// markdownUrl also encodes parentheses.
const MARKDOWN_FILE_URL = 'Fotos%20von%20uns/Test%20%28Owner%29_Fotos%20von%20uns_01_00000001.jpg';
const TEXT = { motto: 'Carpe diem', description: '[p]Hallo *wink*[/p][p]wir sind [b]zwei[/b][/p]', like: '[i]Sauna[/i]', dislike: '' };
const ALBUMS = [{
  title: 'Fotos von uns',
  description: 'Sommer\n2026',
  photos: [
    { file: FILE, title: 'Am See', description: 'Ein [b]See[/b]', hashtags: ['sommer', '#see'] },
    { file: 'Fotos von uns/O_02.jpg', title: '', description: '', hashtags: [] },
  ],
}];
const PROFILE = { owner: 'Test (Owner)', text: TEXT, albums: ALBUMS, exportedAt: DATE };

describe('profileTextToMarkdown', () => {
  test('escapes first, then turns [b] and [i] into Markdown; smiley codes stay escaped text', () => {
    assert.equal(profileTextToMarkdown('Hallo *kuss* [b]fett[/b] und [i]schräg[/i]'), 'Hallo \\*kuss\\* **fett** und *schräg*');
  });

  test('spaces inside [b] and [i] move outside the markers', () => {
    assert.equal(profileTextToMarkdown('a[b] fett [/b]b[i]x [/i]'), 'a **fett** b*x* ');
  });

  test('[p] and blank lines separate paragraphs; single line breaks stay', () => {
    assert.equal(profileTextToMarkdown('[p]eins\nzwei[/p][p]drei[/p]\n\nvier'), 'eins\nzwei\n\ndrei\n\nvier');
  });

  test('other tags, unclosed tags and Markdown syntax stay text', () => {
    assert.equal(profileTextToMarkdown('[u]x[/u] [b]offen # [Link](https://x)'), '\\[u\\]x\\[/u\\] \\[b\\]offen # \\[Link\\](https://x)');
  });

  test('a paragraph starting with a heading marker is escaped', () => {
    assert.equal(profileTextToMarkdown('[p]# kein Titel[/p]'), '\\# kein Titel');
  });

  test('empty or missing text gives an empty string', () => {
    assert.equal(profileTextToMarkdown(''), '');
    assert.equal(profileTextToMarkdown(undefined), '');
  });
});

describe('profileTextToHtml', () => {
  test('escapes first, then turns [b], [i], [p] and line breaks into HTML', () => {
    assert.equal(
      profileTextToHtml('[p]<script>alert(1)</script> [b]fett[/b][/p][p][i]a[/i]\nb[/p]'),
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>fett</strong></p>\n<p><em>a</em><br>\nb</p>',
    );
  });

  test('an unclosed tag stays text', () => {
    assert.equal(profileTextToHtml('[b]offen'), '<p>[b]offen</p>');
  });
});

describe('renderProfileMarkdown', () => {
  const markdown = renderProfileMarkdown(PROFILE);

  test('starts with the owner and the export line', () => {
    assert.match(markdown, /^# Test \(Owner\)\nExported 2026-10-09 10:05 · 2 photos\n/);
  });

  test('shows the non-empty profile text sections in order', () => {
    assert.ok(markdown.includes('## Profile text\n\n### Motto\n\nCarpe diem\n\n### About\n\nHallo \\*wink\\*\n\nwir sind **zwei**\n\n### Likes\n\n*Sauna*\n'));
    assert.ok(!markdown.includes('### Dislikes'));
  });

  test('lists every album photo with a per-segment encoded link, its caption and hashtags', () => {
    assert.ok(markdown.includes(`## Albums\n\n### Fotos von uns\n\nSommer\n2026\n\n- [Am See](${MARKDOWN_FILE_URL})\n  Ein **See**\n  #sommer #see\n- [O\\_02.jpg](Fotos%20von%20uns/O_02.jpg)\n`));
  });

  test('without profile text or captions: album list only', () => {
    const plain = renderProfileMarkdown({
      owner: '', text: null, albums: [{ title: 'A', description: '', photos: [{ file: 'A/x.jpg' }] }], exportedAt: DATE,
    });

    assert.equal(plain, '# Unknown\nExported 2026-10-09 10:05 · 1 photos\n\n## Albums\n\n### A\n\n- [x.jpg](A/x.jpg)\n');
  });
});

describe('renderProfileHtml', () => {
  const html = renderProfileHtml(PROFILE);

  test('is a self-contained page that loads nothing remote', () => {
    assert.match(html, /^<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">/);
    assert.ok(!/(?:src|href)="https?:/.test(html));
  });

  test('shows the profile text sections and every photo inline with its caption', () => {
    assert.ok(html.includes('<h3>About</h3>\n<p>Hallo *wink*</p>\n<p>wir sind <strong>zwei</strong></p>'));
    assert.ok(html.includes(`<a href="${FILE_URL}"><img src="${FILE_URL}" alt="Am See"></a>`));
    assert.ok(html.includes('<figcaption>\n<p><strong>Am See</strong></p>\n<p>Ein <strong>See</strong></p>\n<p class="hashtags">#sommer #see</p>\n</figcaption>'));
    assert.ok(html.includes('<img src="Fotos%20von%20uns/O_02.jpg" alt="O_02.jpg"></a>\n</figure>'));
    assert.ok(!html.includes('Dislikes'));
  });

  test('escapes owner, titles, captions and hashtags', () => {
    const page = renderProfileHtml({
      owner: '<b>O</b>',
      text: null,
      albums: [{ title: '<i>A</i>', description: '', photos: [{ file: 'A/"x".jpg', title: '<img onerror=x>', description: '', hashtags: ['<s>'] }] }],
      exportedAt: DATE,
    });

    assert.ok(!/<(?:b|i|s)>|<img onerror/.test(page));
    assert.ok(page.includes('<title>&lt;b&gt;O&lt;/b&gt;</title>'));
    assert.ok(page.includes('src="A/%22x%22.jpg"'));
    assert.ok(page.includes('#&lt;s&gt;'));
  });
});

describe('sed card in the profile report', () => {
  const SED_CARD = {
    title: 'Steckbrief',
    preferencesTitle: 'Vorlieben',
    persons: [
      {
        label: 'Sie',
        properties: [{ label: 'Größe', value: '170 cm' }, { label: 'Haarfarbe', value: 'Dunkelblond' }],
        preferences: [{ rating: 'Unbedingt', items: ['Sexspielzeug'] }, { rating: 'Steh ich drauf', items: ['Analsex', 'Küssen'] }],
      },
      { label: 'Er', properties: [], preferences: [{ rating: 'Situationsabhängig', items: ['Massagen'] }] },
    ],
  };
  const SINGLE = { ...SED_CARD, persons: [{ ...SED_CARD.persons[0], label: null }] };
  const HOSTILE = {
    title: '<b>T</b>',
    preferencesTitle: 'P',
    persons: [{ label: '<i>L</i>', properties: [{ label: '*x*', value: '<script>' }], preferences: [{ rating: '_r_', items: ['[a](b)'] }] }],
  };

  test('markdown: Steckbrief and Vorlieben between Profile text and Albums, per person', () => {
    const markdown = renderProfileMarkdown({ ...PROFILE, sedCard: SED_CARD });

    assert.ok(markdown.includes([
      '*Sauna*', '', '## Steckbrief', '', '### Sie', '', '- **Größe:** 170 cm', '- **Haarfarbe:** Dunkelblond', '',
      '## Vorlieben', '', '### Sie', '', '- **Unbedingt:** Sexspielzeug', '- **Steh ich drauf:** Analsex, Küssen', '',
      '### Er', '', '- **Situationsabhängig:** Massagen', '', '## Albums',
    ].join('\n')));
  });

  test('markdown: a single profile has no person heading', () => {
    const markdown = renderProfileMarkdown({ ...PROFILE, sedCard: SINGLE });

    assert.ok(markdown.includes('## Steckbrief\n\n- **Größe:** 170 cm\n'));
    assert.ok(markdown.includes('## Vorlieben\n\n- **Unbedingt:** Sexspielzeug\n'));
  });

  test('markdown: no sed card leaves both sections out', () => {
    assert.equal(renderProfileMarkdown({ ...PROFILE, sedCard: null }), renderProfileMarkdown(PROFILE));
  });

  test('markdown escapes every label and value', () => {
    const markdown = renderProfileMarkdown({ ...PROFILE, sedCard: HOSTILE });

    assert.ok(markdown.includes('## \\<b\\>T\\</b\\>\n\n### \\<i\\>L\\</i\\>\n\n- **\\*x\\*:** \\<script\\>\n'));
    assert.ok(markdown.includes('- **\\_r\\_:** \\[a\\](b)\n'));
  });

  test('html: the same sections as lists, before the albums', () => {
    const html = renderProfileHtml({ ...PROFILE, sedCard: SED_CARD });

    assert.ok(html.includes([
      '<h2>Steckbrief</h2>', '<h3>Sie</h3>', '<ul>', '<li><strong>Größe:</strong> 170 cm</li>',
      '<li><strong>Haarfarbe:</strong> Dunkelblond</li>', '</ul>', '<h2>Vorlieben</h2>', '<h3>Sie</h3>', '<ul>',
      '<li><strong>Unbedingt:</strong> Sexspielzeug</li>', '<li><strong>Steh ich drauf:</strong> Analsex, Küssen</li>', '</ul>',
      '<h3>Er</h3>', '<ul>', '<li><strong>Situationsabhängig:</strong> Massagen</li>', '</ul>', '<h2>Albums</h2>',
    ].join('\n')));
    assert.ok(html.indexOf('<h2>Profile text</h2>') < html.indexOf('<h2>Steckbrief</h2>'));
  });

  test('html escapes every label and value', () => {
    const html = renderProfileHtml({ ...PROFILE, sedCard: HOSTILE });

    assert.ok(html.includes('<h2>&lt;b&gt;T&lt;/b&gt;</h2>\n<h3>&lt;i&gt;L&lt;/i&gt;</h3>'));
    assert.ok(html.includes('<li><strong>*x*:</strong> &lt;script&gt;</li>'));
    assert.ok(!html.includes('<script>'));
  });
});
