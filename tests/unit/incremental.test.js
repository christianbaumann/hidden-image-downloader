import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { filterNewEntries, mergeRecord, pendingKey, savedKey, savedRecord } from '../../lib/incremental.js';

const PHOTO_1 = { url: 'https://img/1.jpg', name: 'Album/O_Album_01_00000001.jpg', photoKey: '00000001' };
const PHOTO_3 = { url: 'https://img/3.jpg', name: 'Album/O_Album_03_00000003.jpg', photoKey: '00000003' };
const ATTACHMENT = { url: 'https://cm/a1', name: 'ClubMail/O_ClubMail_01_a1.jpg', attachmentId: 'a1' };
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
});

test('storage keys', () => {
  assert.equal(savedKey('1000001'), 'saved:1000001');
  assert.equal(pendingKey(43), 'pending:43');
});
