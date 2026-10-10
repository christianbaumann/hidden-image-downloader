import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import muxjs from 'mux.js';
import { bestVariant, parseMasterPlaylist, parseMediaPlaylist, remuxToMp4, withQuery } from '../../lib/hls.js';
import {
  ENCRYPTED_MEDIA_PLAYLIST, MEDIA_PLAYLIST, SEGMENT_NAMES, VIDEO_ID_1, masterPlaylist, masterUrlOf, segmentBytes, variantNameOf,
} from '../fixtures/video-api.js';

const MASTER_URL = masterUrlOf(VIDEO_ID_1);
const HLS_DIR = MASTER_URL.slice(0, MASTER_URL.lastIndexOf('/') + 1);
const MP4_BOX_TYPE_OFFSET = 4;
const MP4_BOX_TYPE_LENGTH = 4;

const boxType = (bytes, offset) => new TextDecoder().decode(bytes.subarray(offset + MP4_BOX_TYPE_OFFSET, offset + MP4_BOX_TYPE_OFFSET + MP4_BOX_TYPE_LENGTH));

// Top-level box types of an mp4.
function topLevelBoxes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types = [];
  for (let offset = 0; offset < bytes.length; offset += view.getUint32(offset)) {
    types.push(boxType(bytes, offset));
  }
  return types;
}

const DURATION_BOXES = new Set(['mvhd', 'tkhd', 'mdhd']);
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia']);
const FULL_BOX_HEADER = 12;
const DURATION_AT = { mvhd: 12, tkhd: 16, mdhd: 12 };

// Version-0 duration field of every mvhd, tkhd and mdhd in the moov box: [[type, duration]].
function moovDurations(bytes, start = 0, end = bytes.length) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = [];
  for (let offset = start; offset < end; offset += view.getUint32(offset)) {
    const type = boxType(bytes, offset);
    if (DURATION_BOXES.has(type)) {
      assert.equal(bytes[offset + 8], 0, `${type} is version 0`);
      found.push([type, view.getUint32(offset + FULL_BOX_HEADER + DURATION_AT[type])]);
    }
    if (CONTAINER_BOXES.has(type)) {
      found.push(...moovDurations(bytes, offset + 8, offset + view.getUint32(offset)));
    }
  }
  return found;
}

describe('parseMasterPlaylist', () => {
  test('lists every variant with its absolute URL, bandwidth and pixel count', () => {
    assert.deepEqual(parseMasterPlaylist(masterPlaylist(VIDEO_ID_1), MASTER_URL), [
      { url: `${HLS_DIR}${variantNameOf(VIDEO_ID_1, 854)}`, bandwidth: 415025, pixels: 480 * 854 },
      { url: `${HLS_DIR}${variantNameOf(VIDEO_ID_1, 256)}`, bandwidth: 111824, pixels: 144 * 256 },
    ]);
  });

  test('gives no variants for a media playlist', () => {
    assert.deepEqual(parseMasterPlaylist(MEDIA_PLAYLIST, MASTER_URL), []);
  });

  test('reads a variant without RESOLUTION and with CRLF line ends', () => {
    const text = '#EXTM3U\r\n#EXT-X-STREAM-INF:BANDWIDTH=100\r\nlow.m3u8\r\n';
    assert.deepEqual(parseMasterPlaylist(text, MASTER_URL), [{ url: `${HLS_DIR}low.m3u8`, bandwidth: 100, pixels: 0 }]);
  });
});

describe('bestVariant', () => {
  test('takes the highest bandwidth, not the last listed', () => {
    const variants = [{ url: 'a', bandwidth: 300, pixels: 1 }, { url: 'b', bandwidth: 100, pixels: 9 }];
    assert.equal(bestVariant(variants).url, 'a');
  });

  test('takes more pixels on equal bandwidth', () => {
    const variants = [{ url: 'a', bandwidth: 100, pixels: 1 }, { url: 'b', bandwidth: 100, pixels: 9 }];
    assert.equal(bestVariant(variants).url, 'b');
  });

  test('is null without variants', () => {
    assert.equal(bestVariant([]), null);
  });
});

describe('parseMediaPlaylist', () => {
  test('lists the segments as absolute URLs, unencrypted', () => {
    assert.deepEqual(parseMediaPlaylist(MEDIA_PLAYLIST, `${HLS_DIR}media.m3u8`), {
      segments: SEGMENT_NAMES.map((name) => `${HLS_DIR}${name}`),
      encrypted: false,
    });
  });

  test('flags an EXT-X-KEY stream as encrypted', () => {
    assert.equal(parseMediaPlaylist(ENCRYPTED_MEDIA_PLAYLIST, MASTER_URL).encrypted, true);
  });

  test('METHOD=NONE is not encrypted', () => {
    const text = MEDIA_PLAYLIST.replace('#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-KEY:METHOD=NONE');
    assert.equal(parseMediaPlaylist(text, MASTER_URL).encrypted, false);
  });

  test('gives no segments for a master playlist', () => {
    assert.deepEqual(parseMediaPlaylist(masterPlaylist(VIDEO_ID_1), MASTER_URL).segments, []);
  });
});

describe('withQuery', () => {
  test('appends the query with ? or &', () => {
    assert.equal(withQuery('https://h/a.ts', 'Policy=p'), 'https://h/a.ts?Policy=p');
    assert.equal(withQuery('https://h/a.ts?x=1', 'Policy=p'), 'https://h/a.ts?x=1&Policy=p');
  });

  test('keeps the URL without a query', () => {
    assert.equal(withQuery('https://h/a.ts', ''), 'https://h/a.ts');
  });
});

describe('remuxToMp4', () => {
  test('turns the TS segments into one fragmented mp4: ftyp, moov, then fragments', () => {
    const mp4 = remuxToMp4(SEGMENT_NAMES.map(segmentBytes), muxjs);

    const boxes = topLevelBoxes(mp4);
    assert.deepEqual(boxes.slice(0, 2), ['ftyp', 'moov']);
    assert.ok(boxes.includes('moof'));
    assert.ok(boxes.includes('mdat'));
  });

  test('sets the movie, track and media durations to 0, so players add up the fragments', () => {
    const mp4 = remuxToMp4(SEGMENT_NAMES.map(segmentBytes), muxjs);

    assert.deepEqual(moovDurations(mp4), [['mvhd', 0], ['tkhd', 0], ['mdhd', 0], ['tkhd', 0], ['mdhd', 0]]);
  });

  test('is null for bytes that are no TS', () => {
    assert.equal(remuxToMp4([new Uint8Array([1, 2, 3]).buffer], muxjs), null);
  });
});
