import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeSegment,
  extensionFromUrl,
  buildFilename,
  photoStem,
  folderSegment,
  reserveUniqueName,
  titleSegment,
  MAX_FILENAME_BYTES,
} from '../../lib/filename.js';

const IMAGE_URL = 'https://cdn.example.com/photos/image_1920_x.webp?cache=abc';

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

test('photoStem joins owner, folder, number and key', () => {
  assert.equal(photoStem({ owner: 'O', folder: 'Album', number: '03', key: 'abcd1234' }), 'O_Album_03_abcd1234');
});

test('photoStem leaves out empty parts', () => {
  assert.equal(photoStem({ owner: 'O', folder: '', number: '', key: 'abcd1234' }), 'O_abcd1234');
  assert.equal(photoStem({ owner: 'O', folder: 'Album', number: '03', key: null }), 'O_Album_03');
});

test('photoStem puts the title before the key', () => {
  assert.equal(
    photoStem({ owner: 'O', folder: 'Album', number: '03', title: 'Rück-Ansicht', key: 'abcd1234', extension: 'jpg' }),
    'O_Album_03_Rück-Ansicht_abcd1234',
  );
  assert.equal(photoStem({ owner: 'O', title: 'T', key: 'abcd1234', extension: 'jpg' }), 'O_T_abcd1234');
});

const bytes = (text) => new TextEncoder().encode(text).length;

test('photoStem cuts a long title first, keeping owner, number, key and extension', () => {
  const stem = photoStem({ owner: 'O', folder: 'Album', number: '03', title: '😀'.repeat(80), key: 'abcd1234', extension: 'jpg' });

  assert.ok(bytes(`${stem}.jpg`) <= MAX_FILENAME_BYTES);
  assert.match(stem, /^O_Album_03_(😀)+_abcd1234$/u);
});

test('photoStem cuts the album after the title, within the byte cap', () => {
  const stem = photoStem({
    owner: 'Owner', folder: '写真'.repeat(40), number: '03', title: '題名'.repeat(40), key: 'abcd1234', extension: 'jpeg',
  });

  assert.ok(bytes(`${stem}.jpeg`) <= MAX_FILENAME_BYTES, `${bytes(stem)} bytes`);
  assert.match(stem, /^Owner_(写真)+写?_03_abcd1234$/u);
});

test('photoStem trims a separator left at the end of a cut title', () => {
  const owner = 'O'.repeat(188);
  const stem = photoStem({ owner, title: 'abcd-efgh', key: 'k', extension: 'jpg' });

  assert.equal(`${stem}.jpg`.length, MAX_FILENAME_BYTES - 1);
  assert.equal(stem, `${owner}_abcd_k`);
});

test('photoStem drops a title cut to nothing, with its separator', () => {
  const owner = 'O'.repeat(194);

  assert.equal(photoStem({ owner, title: 'abc', key: 'k', extension: 'jpg' }), `${owner}_k`);
});

test('buildFilename stays within the byte cap for a long album', () => {
  const name = buildFilename({ owner: 'O', album: '写真'.repeat(40), position: 1, count: 1, photoId: 'k', url: IMAGE_URL });

  assert.ok(bytes(name) <= MAX_FILENAME_BYTES);
  assert.match(name, /^O_(写真)+写?_01_k\.webp$/u);
});

test('photoStem leaves a name within the cap unchanged', () => {
  const title = 'a'.repeat(80);
  const folder = 'b'.repeat(80);

  assert.equal(photoStem({ owner: 'O', folder, number: '03', title, key: 'k', extension: 'jpg' }), `O_${folder}_03_${title}_k`);
});

test('titleSegment uses the folder rules', () => {
  assert.equal(titleSegment('Rück Ansicht'), 'Rück-Ansicht');
  assert.equal(titleSegment('Mu\u0308nchen'), 'M\u00FCnchen');
  assert.equal(titleSegment('a<b>c:d"e/f\\g|h?i*j\u0007k\u200Dl. '), 'a_b_c_d_e_f_g_h_i_j_k_l');
  assert.equal(titleSegment('CON'), 'CON_');
  assert.equal(titleSegment(null), '');
});

test('titleSegment keeps #, % and &', () => {
  assert.equal(titleSegment('#1 100% & mehr'), '#1-100%-&-mehr');
});

test('titleSegment drops placeholder titles', () => {
  for (const title of ['...', 'Profilbild', ' ... ']) assert.equal(titleSegment(title), '', title);
});

test('titleSegment caps at 80 code points', () => {
  assert.equal(titleSegment('😀'.repeat(81)), '😀'.repeat(80));
});

test('buildFilename: album photo → <Owner>_<Album>_<nn>_<id>', () => {
  assert.equal(
    buildFilename({ owner: 'BitPaerchen', album: 'Fotos von uns', position: 3, count: 12, photoId: 'abcd1234', url: IMAGE_URL }),
    'BitPaerchen_Fotos-von-uns_03_abcd1234.webp',
  );
});

test('buildFilename pads the number to the width of count', () => {
  assert.equal(
    buildFilename({ owner: 'O', album: 'A', position: 7, count: 120, photoId: 'k', url: IMAGE_URL }),
    'O_A_007_k.webp',
  );
});

test('buildFilename without album context → <Owner>_<id>', () => {
  assert.equal(buildFilename({ owner: 'Owner', photoId: '1001', url: IMAGE_URL }), 'Owner_1001.webp');
});

test('buildFilename drops the album part when title or position is unusable', () => {
  const base = { owner: 'O', album: 'A', position: 2, count: 5, photoId: 'k', url: IMAGE_URL };
  for (const change of [{ album: '' }, { album: '///' }, { position: null }, { position: 0 }, { position: 6 }, { count: undefined }]) {
    assert.equal(buildFilename({ ...base, ...change }), 'O_k.webp', JSON.stringify(change));
  }
});

test('buildFilename falls back to unknown owner and image', () => {
  assert.equal(buildFilename({ owner: '', photoId: null, url: IMAGE_URL }), 'unknown_image.webp');
});

test('buildFilename sanitises owner, album and id', () => {
  const name = buildFilename({ owner: 'a/b c', album: 'x:y', position: 1, count: 1, photoId: 'p/q', url: IMAGE_URL });
  assert.equal(name, 'a_b-c_x_y_01_p_q.webp');
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
