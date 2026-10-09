import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { contentToHtml, contentToMarkdown, contentToText, decodeEntities, escapeHtml, markdownUrl } from '../../lib/clubmail-content.js';

const SMILEY = '<img class="joy_smiley" src="//cfnimg.joyclub.de/smile/grins.gif" alt=":-D">';

describe('decodeEntities', () => {
  test('decodes named, decimal and hex entities', () => {
    assert.equal(decodeEntities('&quot;a&quot; &amp; &lt;b&gt; &#39;c&#39; &#x263A;'), '"a" & <b> \'c\' ☺');
  });

  test('keeps unknown entities and out-of-range code points', () => {
    assert.equal(decodeEntities('&bogus; &#x110000;'), '&bogus; &#x110000;');
  });

  test('decodes German and typographic entities', () => {
    assert.equal(decodeEntities('Gr&uuml;&szlig;e &Auml; &hellip; &euro;'), 'Grüße Ä … €');
  });

  test('decodes only once', () => {
    assert.equal(decodeEntities('&amp;lt;'), '&lt;');
  });
});

describe('contentToMarkdown', () => {
  test('turns <br /> into a newline', () => {
    assert.equal(contentToMarkdown('one<br />two<br>three'), 'one\ntwo\nthree');
  });

  test('turns a smiley into its alt text', () => {
    assert.equal(contentToMarkdown(`hi ${SMILEY}`), 'hi :-D');
  });

  test('turns an http(s) link into a Markdown link', () => {
    assert.equal(
      contentToMarkdown('see <a class="j-anchor primary" href="https://example.com/a?x=1&amp;y=2">here</a>'),
      'see [here](https://example.com/a?x=1&y=2)',
    );
  });

  test('a link without text shows its URL', () => {
    assert.equal(contentToMarkdown('<a href="http://example.com"></a>'), '[http://example.com](http://example.com)');
  });

  test('a javascript: link keeps only its text', () => {
    assert.equal(contentToMarkdown('<a href="javascript:alert(1)">click</a>'), 'click');
  });

  test('turns a <j-a> album link into a Markdown link', () => {
    assert.equal(
      contentToMarkdown('für das <j-a href="https://www.joyclub.de/profile/fotoalbum/1-2.x.html" target="_blank">Fotoalbum &quot;we&quot; von X</j-a> frei'),
      'für das [Fotoalbum "we" von X](https://www.joyclub.de/profile/fotoalbum/1-2.x.html) frei',
    );
  });

  test('decodes entities in text', () => {
    assert.equal(contentToMarkdown('&quot;Tom &amp; Jerry&quot;'), '"Tom & Jerry"');
  });

  test('strips any other tag and keeps its text', () => {
    assert.equal(contentToMarkdown('<b>bold</b> <img src="https://x/y.png"><script>x()</script>'), 'bold x()');
  });

  test('escapes Markdown typed as text, so it stays text', () => {
    assert.equal(
      contentToMarkdown('[x](javascript:alert(1)) ![t](https://evil/p.gif) &lt;img src=x onerror=alert(1)&gt; *a* _b_ `c`'),
      '\\[x\\](javascript:alert(1)) !\\[t\\](https://evil/p.gif) \\<img src=x onerror=alert(1)\\> \\*a\\* \\_b\\_ \\`c\\`',
    );
  });

  test('escapes headings, list and quote markers at a line start', () => {
    assert.equal(contentToMarkdown('# head<br>- item<br>+ item<br>1. one<br>&gt; quote<br>a - b'), '\\# head\n\\- item\n\\+ item\n1\\. one\n\\> quote\na - b');
  });

  test('a line break or bracket inside link text keeps the link intact', () => {
    assert.equal(contentToMarkdown('<a href="https://a">x]y<br>z</a>'), '[x\\]y z](https://a)');
  });

  test('an unclosed link keeps its text', () => {
    assert.equal(contentToMarkdown('<a href="https://x">open'), 'open');
  });

  test('empty or missing content gives an empty string', () => {
    assert.equal(contentToMarkdown(''), '');
    assert.equal(contentToMarkdown(undefined), '');
  });
});

describe('contentToHtml', () => {
  test('keeps <br> and turns a smiley into its alt text', () => {
    assert.equal(contentToHtml(`one<br />two ${SMILEY}`), 'one<br>two :-D');
  });

  test('keeps an http(s) link with an escaped href', () => {
    assert.equal(
      contentToHtml('see <a class="j-anchor primary" href="https://example.com/a?x=1&amp;y=&quot;2">here</a>'),
      'see <a href="https://example.com/a?x=1&amp;y=&quot;2">here</a>',
    );
  });

  test('a link without text shows its escaped URL', () => {
    assert.equal(contentToHtml('<a href="http://e.com/?a&amp;b"></a>'), '<a href="http://e.com/?a&amp;b">http://e.com/?a&amp;b</a>');
  });

  test('keeps a <j-a> link; a javascript: <j-a> keeps only its text', () => {
    assert.equal(
      contentToHtml('<j-a href="https://www.joyclub.de/a.html">Fotoalbum &quot;we&quot;</j-a> <j-a href="javascript:x">bad</j-a>'),
      '<a href="https://www.joyclub.de/a.html">Fotoalbum &quot;we&quot;</a> bad',
    );
  });

  test('a link with another scheme keeps only its text', () => {
    assert.equal(contentToHtml('<a href="javascript:alert(1)">click</a> <a href="data:text/html,x">d</a>'), 'click d');
  });

  test('decodes entities, then escapes, so typed markup stays text', () => {
    assert.equal(
      contentToHtml('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Tom &amp; Jerry\'s'),
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Tom &amp; Jerry&#39;s',
    );
  });

  test('strips any other tag, including remote images and scripts', () => {
    assert.equal(contentToHtml('<b>bold</b> <img src="https://x/y.png" onerror="a()"><script>x()</script>'), 'bold x()');
  });

  test('the scheme check ignores case and runs after entity decoding', () => {
    assert.equal(contentToHtml('<a href="HTTPS://a">x</a>'), '<a href="HTTPS://a">x</a>');
    assert.equal(contentToHtml('<a href="&#106;avascript:a()">x</a> <a href=" https://a">y</a>'), 'x y');
  });

  test('a quote in an unquoted href stays inside the attribute', () => {
    assert.equal(contentToHtml('<a href=https://a"onmouseover=b()>x</a>'), '<a href="https://a&quot;onmouseover=b()">x</a>');
  });

  test('a link opened inside another link keeps the outer text', () => {
    assert.equal(contentToHtml('<a href="https://a">one <a href="https://b">two</a>'), 'one <a href="https://b">two</a>');
  });

  test('empty or missing content gives an empty string', () => {
    assert.equal(contentToHtml(undefined), '');
  });
});

describe('escapeHtml', () => {
  test('escapes &, <, >, double and single quotes', () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('contentToText', () => {
  test('gives one line with link texts and smiley alts', () => {
    assert.equal(contentToText(`a<br />b  <a href="https://x">link</a> ${SMILEY}`), 'a b link :-D');
  });
});

describe('markdownUrl', () => {
  test('percent-encodes spaces, parentheses and angle brackets', () => {
    assert.equal(markdownUrl('Max (B) <x>.jpg'), 'Max%20%28B%29%20%3Cx%3E.jpg');
  });
});
