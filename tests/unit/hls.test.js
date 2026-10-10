import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import muxjs from 'mux.js';
import { bestVariant, isMp4, joinFragments, parseMasterPlaylist, parseMediaPlaylist, remuxToMp4, withQuery } from '../../lib/hls.js';
import {
  BYTERANGE_FILE, BYTERANGE_MEDIA_PLAYLIST, ENCRYPTED_MEDIA_PLAYLIST, FMP4_FILES, FMP4_MEDIA_PLAYLIST, MEDIA_PLAYLIST, SEGMENT_NAMES,
  VIDEO_ID_1, byteRangeBytes, fmp4Bytes, masterPlaylist, masterUrlOf, segmentBytes, variantNameOf,
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
      segments: SEGMENT_NAMES.map((name) => ({ url: `${HLS_DIR}${name}` })),
      map: null,
      encrypted: false,
    });
  });

  test('reads the EXT-X-MAP init section of an fMP4 stream', () => {
    const [init, ...segments] = FMP4_FILES;
    assert.deepEqual(parseMediaPlaylist(FMP4_MEDIA_PLAYLIST, `${HLS_DIR}media.m3u8`), {
      segments: segments.map((name) => ({ url: `${HLS_DIR}${name}` })),
      map: { url: `${HLS_DIR}${init}` },
      encrypted: false,
    });
  });

  test('reads EXT-X-BYTERANGE parts, also without an offset, and a map with a byte range', () => {
    const url = `${HLS_DIR}${BYTERANGE_FILE}`;
    assert.deepEqual(parseMediaPlaylist(BYTERANGE_MEDIA_PLAYLIST, `${HLS_DIR}media.m3u8`).segments, [
      { url, range: { start: 0, end: 9023 } }, { url, range: { start: 9024, end: 16919 } },
    ]);
    const text = '#EXTM3U\n#EXT-X-MAP:URI="all.mp4",BYTERANGE="100@0"\n#EXT-X-BYTERANGE:50@100\nall.mp4\n#EXT-X-BYTERANGE:30\nall.mp4\n';
    assert.deepEqual(parseMediaPlaylist(text, `${HLS_DIR}media.m3u8`), {
      segments: [{ url: `${HLS_DIR}all.mp4`, range: { start: 100, end: 149 } }, { url: `${HLS_DIR}all.mp4`, range: { start: 150, end: 179 } }],
      map: { url: `${HLS_DIR}all.mp4`, range: { start: 0, end: 99 } },
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

  test('numbers the movie fragments 1, 2, … so AVFoundation reads every track, not only the first fragment', () => {
    const mp4 = remuxToMp4(SEGMENT_NAMES.map(segmentBytes), muxjs);
    const view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
    const sequences = [];
    for (let offset = 0; offset < mp4.length; offset += view.getUint32(offset)) {
      if (boxType(mp4, offset) === 'moof') sequences.push(view.getUint32(offset + 8 + FULL_BOX_HEADER));
    }

    assert.deepEqual(sequences, [1, 2]);
  });

  test('remuxes TS parts cut from one file by byte range', () => {
    const file = byteRangeBytes();
    const { segments } = parseMediaPlaylist(BYTERANGE_MEDIA_PLAYLIST, `${HLS_DIR}media.m3u8`);
    const mp4 = remuxToMp4(segments.map(({ range }) => file.subarray(range.start, range.end + 1)), muxjs);

    assert.deepEqual(topLevelBoxes(mp4).slice(0, 2), ['ftyp', 'moov']);
  });

  test('is null for bytes that are no TS', () => {
    assert.equal(remuxToMp4([new Uint8Array([1, 2, 3]).buffer], muxjs), null);
  });
});

describe('isMp4', () => {
  test('tells an fMP4 init section from TS bytes', () => {
    assert.equal(isMp4(fmp4Bytes('init.mp4')), true);
    assert.equal(isMp4(segmentBytes(SEGMENT_NAMES[0])), false);
    assert.equal(isMp4(new Uint8Array(3).buffer), false);
  });
});

describe('joinFragments', () => {
  test('joins init section and fMP4 segments into one mp4 with numbered fragments and zero durations', () => {
    const [init, ...segments] = FMP4_FILES.map(fmp4Bytes);

    const mp4 = joinFragments(init, segments);

    assert.equal(mp4.length, [init, ...segments].reduce((length, part) => length + part.length, 0));
    assert.deepEqual(topLevelBoxes(mp4).slice(0, 2), ['ftyp', 'moov']);
    assert.ok(moovDurations(mp4).every(([, duration]) => duration === 0));
    const view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
    const sequences = [];
    for (let offset = 0; offset < mp4.length; offset += view.getUint32(offset)) {
      if (boxType(mp4, offset) === 'moof') sequences.push(view.getUint32(offset + 8 + FULL_BOX_HEADER));
    }
    assert.deepEqual(sequences, [1, 2]);
  });
});
