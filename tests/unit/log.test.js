import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLog, logDataUrl, renderLog, stripQuery } from '../../lib/log.js';

const START_MS = Date.UTC(2026, 9, 9, 12, 0, 0);
const STEP_MS = 25;

function clock() {
  let now = START_MS;
  return () => {
    const current = now;
    now += STEP_MS;
    return current;
  };
}

test('stripQuery drops query and fragment', () => {
  assert.equal(
    stripQuery('https://www.joyclub.de/clubmailv3/attachment/download/?attachment_id=1&message_id=2#x'),
    'https://www.joyclub.de/clubmailv3/attachment/download/',
  );
});

test('stripQuery keeps a URL without query', () => {
  assert.equal(stripQuery('https://cdn.joyclub.de/img/a.jpg'), 'https://cdn.joyclub.de/img/a.jpg');
});

test('stripQuery cuts the query from a value that is no absolute URL', () => {
  assert.equal(stripQuery('/relative/path?token=abc'), '/relative/path');
});

test('each line records the time since the log started', () => {
  const log = createLog(clock());
  log.add('first');
  log.add('second');

  assert.deepEqual(log.lines.map(({ ms }) => ms), [STEP_MS, 2 * STEP_MS]);
});

test('renderLog writes a header and one line per step with only the given fields', () => {
  const log = createLog(clock());
  log.add('path: lightbox', { url: 'https://www.joyclub.de/fotos/feed/?page=2' });
  log.add('probe', { status: 404, url: 'https://cdn.joyclub.de/a.jpg?c=1' });
  log.add('error: UnsupportedPageError', { reason: 'works on JoyClub pages only' });

  assert.equal(renderLog(log), [
    'Hidden Image Downloader log',
    'started: 2026-10-09T12:00:00.000Z',
    '',
    '+25 ms  path: lightbox  url=https://www.joyclub.de/fotos/feed/',
    '+50 ms  probe  status=404  url=https://cdn.joyclub.de/a.jpg',
    '+75 ms  error: UnsupportedPageError  reason=works on JoyClub pages only',
    '',
  ].join('\n'));
});

test('renderLog keeps a status of 0', () => {
  const log = createLog(clock());
  log.add('probe', { status: 0 });

  assert.match(renderLog(log), /probe {2}status=0\n/);
});

test('logDataUrl round-trips the text', () => {
  const text = 'a log\nwith ü & #';

  const url = logDataUrl(text);

  assert.equal(decodeURIComponent(url.slice(url.indexOf(',') + 1)), text);
});

test('a log continuing another one counts from the given start', () => {
  const log = createLog(() => START_MS + STEP_MS, START_MS);
  log.add('fetch');

  assert.equal(log.startedAt, START_MS);
  assert.deepEqual(log.lines.map(({ ms }) => ms), [STEP_MS]);
});

test('append adds lines recorded elsewhere unchanged', () => {
  const log = createLog(clock());
  log.add('first');
  log.append([{ ms: 99, step: 'photo: missing', status: 404 }]);

  assert.deepEqual(log.lines.map(({ ms, step }) => `${ms} ${step}`), [`${STEP_MS} first`, '99 photo: missing']);
});
