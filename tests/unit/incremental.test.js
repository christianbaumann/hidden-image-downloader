import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { filterNewEntries, fingerprint, mergeRecord, pendingKey, savedKey, savedRecord } from '../../lib/incremental.js';

const PHOTO_1 = { url: 'https://img/1.jpg', name: 'Album/O_Album_01_00000001.jpg', photoKey: '00000001' };
const PHOTO_3 = { url: 'https://img/3.jpg', name: 'Album/O_Album_03_00000003.jpg', photoKey: '00000003' };
const ATTACHMENT = { url: 'https://cm/a1', name: 'ClubMail/O_ClubMail_01_a1.jpg', attachmentId: 'a1' };
const VIDEO = { url: 'https://v/900001.m3u8', name: 'Videos/O_Videos_01_900001.mp4', videoId: '900001', hls: { query: 'Policy=p' } };
const KEYLESS = { url: 'https://img/x.jpg', name: 'Album/O_Album_02.jpg' };
const REPORTS = [{ name: 'skipped.txt', text: 'Lady (9 photos)\n' }];
const REQUEST = { zipName: 'O.zip', entries: [PHOTO_1, PHOTO_3, ATTACHMENT], reports: REPORTS, lastMessageId: '12' };

describe('filterNewEntries', () => {
  test('first run: every entry is new', () => {
    const { request, nothingNew } = filterNewEntries(REQUEST, undefined);

    assert.deepEqual(request, REQUEST);
    assert.equal(nothingNew, false);
  });

  test('partial: keeps only unsaved entries, with their names and numbers', () => {
    const { request, nothingNew } = filterNewEntries(REQUEST, { photos: ['00000001'], attachments: ['a1'], lastMessageId: '12' });

    assert.deepEqual(request.entries, [PHOTO_3]);
    assert.equal(request.zipName, 'O.zip');
    assert.equal(nothingNew, false);
  });

  test('keeps the reports complete', () => {
    assert.deepEqual(filterNewEntries(REQUEST, { photos: ['00000001'], attachments: [] }).request.reports, REPORTS);
  });

  test('nothing new: every entry saved and no newer message', () => {
    const { request, nothingNew } = filterNewEntries(REQUEST, { photos: ['00000001', '00000003'], attachments: ['a1'], lastMessageId: '12' });

    assert.deepEqual(request.entries, []);
    assert.equal(nothingNew, true);
  });

  test('a new message without new files is something new', () => {
    const { request, nothingNew } = filterNewEntries(REQUEST, { photos: ['00000001', '00000003'], attachments: ['a1'], lastMessageId: '11' });

    assert.deepEqual(request.entries, []);
    assert.equal(nothingNew, false);
  });

  test('a changed profile text without new files is something new', () => {
    const request = { entries: [PHOTO_1], reports: [], profileTextHash: 'bbbbbbbb' };

    assert.equal(filterNewEntries(request, { photos: ['00000001'], attachments: [], profileTextHash: 'aaaaaaaa' }).nothingNew, false);
    assert.equal(filterNewEntries(request, { photos: ['00000001'], attachments: [], profileTextHash: 'bbbbbbbb' }).nothingNew, true);
  });

  test('a request without profile text hash is nothing new once its files are saved', () => {
    const { nothingNew } = filterNewEntries({ entries: [PHOTO_1], reports: [] }, { photos: ['00000001'], attachments: [], profileTextHash: 'aaaaaaaa' });

    assert.equal(nothingNew, true);
  });

  test('a request without messages is nothing new once its files are saved', () => {
    const { nothingNew } = filterNewEntries({ entries: [PHOTO_1], reports: [] }, { photos: ['00000001'], attachments: [], lastMessageId: '9' });

    assert.equal(nothingNew, true);
  });

  test('an entry without key always counts as new', () => {
    const { request } = filterNewEntries({ entries: [KEYLESS], reports: [] }, { photos: [], attachments: [] });

    assert.deepEqual(request.entries, [KEYLESS]);
  });

  test('a photo key does not match an attachment id', () => {
    const { request } = filterNewEntries({ entries: [PHOTO_1, ATTACHMENT], reports: [] }, { photos: ['a1'], attachments: ['00000001'] });

    assert.deepEqual(request.entries, [PHOTO_1, ATTACHMENT]);
  });
});

describe('savedRecord', () => {
  test('records the keys of every added entry and the newest message', () => {
    assert.deepEqual(savedRecord([PHOTO_1, ATTACHMENT, KEYLESS], [], '12'), { photos: ['00000001'], attachments: ['a1'], lastMessageId: '12' });
  });

  test('records the profile text hash', () => {
    assert.deepEqual(savedRecord([PHOTO_1], [], undefined, 'aaaaaaaa'), { photos: ['00000001'], attachments: [], profileTextHash: 'aaaaaaaa' });
  });

  test('leaves out missing entries', () => {
    assert.deepEqual(savedRecord([PHOTO_1, PHOTO_3, ATTACHMENT], [PHOTO_3.url, ATTACHMENT.url]), { photos: ['00000001'], attachments: [] });
  });
});

describe('mergeRecord', () => {
  test('starts from an empty record', () => {
    assert.deepEqual(mergeRecord(undefined, { photos: ['p1'], attachments: [] }), { photos: ['p1'], attachments: [] });
  });

  test('unites the keys without duplicates and takes the newer message id', () => {
    const saved = { photos: ['p1', 'p2'], attachments: ['a1'], lastMessageId: '5' };

    assert.deepEqual(mergeRecord(saved, { photos: ['p2', 'p3'], attachments: ['a2'], lastMessageId: '7' }), {
      photos: ['p1', 'p2', 'p3'], attachments: ['a1', 'a2'], lastMessageId: '7',
    });
  });

  test('keeps the saved message id when the record has none', () => {
    assert.equal(mergeRecord({ photos: [], attachments: [], lastMessageId: '5' }, { photos: [], attachments: [] }).lastMessageId, '5');
  });

  test('the record wins on the profile text hash, else the saved one stays', () => {
    const saved = { photos: [], attachments: [], profileTextHash: 'aaaaaaaa' };

    assert.equal(mergeRecord(saved, { photos: [], attachments: [], profileTextHash: 'bbbbbbbb' }).profileTextHash, 'bbbbbbbb');
    assert.equal(mergeRecord(saved, { photos: [], attachments: [] }).profileTextHash, 'aaaaaaaa');
  });
});

describe('fingerprint', () => {
  test('is 8 hex chars, the same for the same text and different for a changed one', () => {
    assert.match(fingerprint('Hallo'), /^[0-9a-f]{8}$/);
    assert.equal(fingerprint('Hallo'), fingerprint('Hallo'));
    assert.notEqual(fingerprint('Hallo'), fingerprint('Hallo!'));
  });

  test('matches FNV-1a for the empty string', () => {
    assert.equal(fingerprint(''), '811c9dc5');
  });
});

test('storage keys', () => {
  assert.equal(savedKey('1000001'), 'saved:1000001');
  assert.equal(pendingKey(43), 'pending:43');
});

describe('videos', () => {
  test('a saved video is not new, an unsaved one is', () => {
    const other = { ...VIDEO, url: 'https://v/900002.m3u8', videoId: '900002' };

    const { request } = filterNewEntries({ entries: [VIDEO, other], reports: [] }, { photos: [], attachments: [], videos: ['900001'] });

    assert.deepEqual(request.entries, [other]);
  });

  test('a video saved before it got a title in its name is still not new', () => {
    const titled = { ...VIDEO, name: 'Videos/O_Videos_01_Am-Strand_900001.mp4' };

    const { request } = filterNewEntries({ entries: [titled], reports: [] }, { photos: [], attachments: [], videos: ['900001'] });

    assert.deepEqual(request.entries, []);
  });

  test('a video id never matches a photo key or attachment id', () => {
    const { request } = filterNewEntries({ entries: [VIDEO], reports: [] }, { photos: ['900001'], attachments: ['900001'] });

    assert.deepEqual(request.entries, [VIDEO]);
  });

  test('savedRecord keeps added videos and leaves out missing ones', () => {
    assert.deepEqual(savedRecord([PHOTO_1, VIDEO], []), { photos: ['00000001'], attachments: [], videos: ['900001'] });
    assert.deepEqual(savedRecord([PHOTO_1, VIDEO], [VIDEO.url]), { photos: ['00000001'], attachments: [] });
  });

  test('mergeRecord unites the videos and leaves them out while there are none', () => {
    assert.deepEqual(mergeRecord({ photos: [], attachments: [], videos: ['1'] }, { photos: [], attachments: [], videos: ['1', '2'] }).videos, ['1', '2']);
    assert.deepEqual(mergeRecord({ photos: [], attachments: [], videos: ['1'] }, { photos: [], attachments: [] }).videos, ['1']);
    assert.equal('videos' in mergeRecord(undefined, { photos: [], attachments: [] }), false);
  });
});
