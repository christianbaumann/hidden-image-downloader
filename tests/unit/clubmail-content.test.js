import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { contentToMarkdown, contentToText, decodeEntities, markdownUrl } from '../../lib/clubmail-content.js';

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
