import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TITLE_LENGTH,
  sanitizeSegment,
  formatTimestamp,
  extensionFromUrl,
  pickTitle,
  buildFilename,
  folderSegment,
  reserveUniqueName,
} from '../../lib/filename.js';

const IMAGE_URL = 'https://cdn.example.com/photos/image_1920_x.webp?cache=abc';
const DATE = new Date(2026, 9, 8, 17, 45, 0);
const TS = '2026-10-08_174500';

test('sanitizeSegment keeps plain text', () => {
  assert.equal(sanitizeSegment('Profilbild'), 'Profilbild');
});

test('sanitizeSegment keeps umlauts and ß', () => {
  assert.equal(sanitizeSegment('Rückansicht Größe'), 'Rückansicht-Größe');
});

test('sanitizeSegment replaces each forbidden char with _', () => {
  for (const ch of ['<', '>', ':', '"', '/', '\\', '|', '?', '*']) {
    assert.equal(sanitizeSegment(`a${ch}b`), 'a_b', `char ${ch}`);
  }
});

test('sanitizeSegment replaces control chars with _', () => {
  for (const ch of ['\u0000', '\u001F', '\u007F']) {
    assert.equal(sanitizeSegment(`a${ch}b`), 'a_b', `char U+${ch.charCodeAt(0).toString(16)}`);
  }
});

test('sanitizeSegment collapses whitespace runs incl. tab/newline/NBSP to -', () => {
  assert.equal(sanitizeSegment('a  \t\n b'), 'a-b');
  assert.equal(sanitizeSegment('a\tb'), 'a-b');
  assert.equal(sanitizeSegment('a\nb'), 'a-b');
  assert.equal(sanitizeSegment('a b'), 'a-b');
});

test('sanitizeSegment trims leading/trailing whitespace, ., -, _', () => {
  assert.equal(sanitizeSegment('..secret.'), 'secret');
  assert.equal(sanitizeSegment('  -_name_-  '), 'name');
});

test('sanitizeSegment replaces Unicode format chars (rejected by Chrome) with _', () => {
  assert.equal(sanitizeSegment('a\u200Db'), 'a_b');
  assert.equal(sanitizeSegment('a\u200Bb'), 'a_b');
  assert.equal(sanitizeSegment('a\u00ADb'), 'a_b');
  assert.equal(sanitizeSegment('a\u202Eb'), 'a_b');
  assert.equal(sanitizeSegment('\u{1F468}\u200D\u{1F469}'), '\u{1F468}_\u{1F469}');
});

test('sanitizeSegment trims leading ~ (rejected by Chrome), keeps inner ~', () => {
  assert.equal(sanitizeSegment('~Anna'), 'Anna');
  assert.equal(sanitizeSegment('An~na'), 'An~na');
});

test('sanitizeSegment allows &', () => {
  assert.equal(sanitizeSegment('Plug & Schwanz'), 'Plug-&-Schwanz');
});

test('sanitizeSegment keeps emoji', () => {
  assert.equal(sanitizeSegment('Sonne 🌞'), 'Sonne-🌞');
});

test('sanitizeSegment truncates at maxLength (79/80/81)', () => {
  assert.equal(sanitizeSegment('a'.repeat(79), 80).length, 79);
  assert.equal(sanitizeSegment('a'.repeat(80), 80).length, 80);
  assert.equal(sanitizeSegment('a'.repeat(81), 80).length, 80);
});

test('sanitizeSegment truncation never leaves trailing - or _', () => {
  assert.equal(sanitizeSegment(`${'a'.repeat(79)} b`, 80), 'a'.repeat(79));
  assert.equal(sanitizeSegment(`${'a'.repeat(79)}/b`, 80), 'a'.repeat(79));
  assert.equal(sanitizeSegment(`${'a'.repeat(79)}.b`, 80), 'a'.repeat(79));
});

test('sanitizeSegment truncation does not split a surrogate pair', () => {
  assert.equal(sanitizeSegment(`${'a'.repeat(79)}🌞🌞`, 80), `${'a'.repeat(79)}🌞`);
});

test('sanitizeSegment returns empty string for empty/null/undefined', () => {
  assert.equal(sanitizeSegment(''), '');
  assert.equal(sanitizeSegment(null), '');
  assert.equal(sanitizeSegment(undefined), '');
});

test('sanitizeSegment returns empty string for only forbidden chars', () => {
  assert.equal(sanitizeSegment('///'), '');
});

test('formatTimestamp formats local time', () => {
  assert.equal(formatTimestamp(DATE), TS);
});

test('formatTimestamp zero-pads single digits', () => {
  assert.equal(formatTimestamp(new Date(2026, 0, 5, 3, 4, 5)), '2026-01-05_030405');
});

test('formatTimestamp handles 00:00:00 and 23:59:59', () => {
  assert.equal(formatTimestamp(new Date(2026, 9, 8, 0, 0, 0)), '2026-10-08_000000');
  assert.equal(formatTimestamp(new Date(2026, 9, 8, 23, 59, 59)), '2026-10-08_235959');
});

test('formatTimestamp handles Dec 31 and Jan 1', () => {
  assert.equal(formatTimestamp(new Date(2025, 11, 31, 12, 0, 0)), '2025-12-31_120000');
  assert.equal(formatTimestamp(new Date(2026, 0, 1, 12, 0, 0)), '2026-01-01_120000');
});

test('extensionFromUrl reads extension ignoring query', () => {
  assert.equal(extensionFromUrl(IMAGE_URL), 'webp');
});

test('extensionFromUrl returns jpg and png as is', () => {
  assert.equal(extensionFromUrl('https://a.b/x.jpg'), 'jpg');
  assert.equal(extensionFromUrl('https://a.b/x.png'), 'png');
});

test('extensionFromUrl lowercases', () => {
  assert.equal(extensionFromUrl('https://a.b/x.JPG'), 'jpg');
});

test('extensionFromUrl falls back to jpg without extension', () => {
  assert.equal(extensionFromUrl('https://a.b/photos/image'), 'jpg');
});

test('extensionFromUrl accepts 4 chars, rejects 5+', () => {
  assert.equal(extensionFromUrl('https://a.b/x.jpeg'), 'jpeg');
  assert.equal(extensionFromUrl('https://a.b/x.jpeg2'), 'jpg');
});

test('extensionFromUrl ignores dots in host and query', () => {
  assert.equal(extensionFromUrl('https://a.b/img?x=y.webp'), 'jpg');
});

test('extensionFromUrl falls back to jpg for invalid URL', () => {
  assert.equal(extensionFromUrl('not a url'), 'jpg');
});

test('pickTitle returns title', () => {
  assert.equal(pickTitle('Profilbild', '1001'), 'Profilbild');
});

test('pickTitle falls back to photo id for placeholder/empty titles', () => {
  for (const title of ['...', '…', '   ', '', null]) {
    assert.equal(pickTitle(title, '1001'), 'photo-1001', `title ${JSON.stringify(title)}`);
  }
});

test('pickTitle falls back to image without photo id', () => {
  assert.equal(pickTitle('...', null), 'image');
  assert.equal(pickTitle('', undefined), 'image');
});

test('buildFilename: owner + title', () => {
  assert.equal(
    buildFilename({ owner: 'BitPaerchen', title: 'Profilbild', photoId: '1001', url: IMAGE_URL, date: DATE }),
    `BitPaerchen_Profilbild_${TS}.webp`,
  );
});

test('buildFilename: owner + placeholder title + photoId', () => {
  assert.equal(
    buildFilename({ owner: 'Owner', title: '...', photoId: '1001', url: IMAGE_URL, date: DATE }),
    `Owner_photo-1001_${TS}.webp`,
  );
});

test('buildFilename: missing owner + title', () => {
  assert.equal(
    buildFilename({ owner: null, title: 'Title', photoId: null, url: IMAGE_URL, date: DATE }),
    `unknown_Title_${TS}.webp`,
  );
});

test('buildFilename: missing owner + placeholder title, no photoId', () => {
  assert.equal(
    buildFilename({ owner: '', title: '…', photoId: null, url: IMAGE_URL, date: DATE }),
    `unknown_image_${TS}.webp`,
  );
});

test('buildFilename sanitises owner and title', () => {
  const name = buildFilename({ owner: 'a/b c', title: 'x:y/z', photoId: null, url: IMAGE_URL, date: DATE });
  assert.equal(name, `a_b-c_x_y_z_${TS}.webp`);
  assert.ok(!name.includes('/'));
});

test('buildFilename falls back when title sanitises to empty', () => {
  assert.equal(
    buildFilename({ owner: 'Owner', title: '///', photoId: '1001', url: IMAGE_URL, date: DATE }),
    `Owner_photo-1001_${TS}.webp`,
  );
});

test('buildFilename truncates title to MAX_TITLE_LENGTH, not owner', () => {
  const owner = 'o'.repeat(100);
  const name = buildFilename({ owner, title: 't'.repeat(200), photoId: null, url: IMAGE_URL, date: DATE });
  assert.equal(name, `${owner}_${'t'.repeat(MAX_TITLE_LENGTH)}_${TS}.webp`);
});

test('folderSegment keeps umlauts and emoji, whitespace → -', () => {
  assert.equal(folderSegment('Fotos von uns'), 'Fotos-von-uns');
  assert.equal(folderSegment('Größe 😀 Spaß'), 'Größe-😀-Spaß');
});

test('folderSegment returns empty for null, undefined and empty', () => {
  for (const value of [null, undefined, '']) {
    assert.equal(folderSegment(value), '');
  }
});

test('folderSegment returns empty for only forbidden chars', () => {
  assert.equal(folderSegment('"/?'), '');
});

test('folderSegment normalises NFD to NFC', () => {
  assert.equal(folderSegment('Mu\u0308nchen'), 'M\u00FCnchen');
});

test('folderSegment replaces / and ? and trims the trailing _', () => {
  assert.equal(folderSegment('Sie/Er?'), 'Sie_Er');
});

test('folderSegment trims trailing spaces and dots', () => {
  assert.equal(folderSegment('Sie '), 'Sie');
  assert.equal(folderSegment('Nass...'), 'Nass');
});

test('folderSegment replaces only the ZWJ in an emoji sequence', () => {
  assert.equal(folderSegment('👨\u200D👩\u200D👧'), '👨_👩_👧');
});

test('folderSegment suffixes Windows device names with _', () => {
  for (const name of ['CON', 'nul', 'Com1', 'LPT9']) {
    assert.equal(folderSegment(name), `${name}_`);
  }
});

test('folderSegment keeps near misses of device names', () => {
  for (const name of ['COM0', 'CONSOLE', 'LPT10']) {
    assert.equal(folderSegment(name), name);
  }
});

test('folderSegment caps at 80 code points', () => {
  assert.equal(folderSegment('a'.repeat(79)), 'a'.repeat(79));
  assert.equal(folderSegment('a'.repeat(80)), 'a'.repeat(80));
  assert.equal(folderSegment('a'.repeat(81)), 'a'.repeat(80));
});

test('folderSegment keeps whole code points when the cut hits an emoji', () => {
  assert.equal(folderSegment(`${'a'.repeat(79)}😀b`), `${'a'.repeat(79)}😀`);
});

test('reserveUniqueName returns a new name unchanged and records it', () => {
  const taken = new Set();
  assert.equal(reserveUniqueName('Aktuelles', taken), 'Aktuelles');
  assert.ok(taken.has('aktuelles'));
});

test('reserveUniqueName numbers repeats from 2', () => {
  const taken = new Set();
  const names = ['a', 'a', 'a'].map((name) => reserveUniqueName(name, taken));
  assert.deepEqual(names, ['a', 'a-2', 'a-3']);
});

test('reserveUniqueName compares case-insensitively', () => {
  const taken = new Set();
  reserveUniqueName('Aktuelles', taken);
  assert.equal(reserveUniqueName('aktuelles', taken), 'aktuelles-2');
});

test('reserveUniqueName avoids a pre-seeded report name', () => {
  assert.equal(reserveUniqueName('missing.txt', new Set(['missing.txt'])), 'missing.txt-2');
});

test('reserveUniqueName skips a numbered name already taken', () => {
  const taken = new Set();
  reserveUniqueName('name', taken);
  reserveUniqueName('name-2', taken);
  assert.equal(reserveUniqueName('name', taken), 'name-3');
});
