const STREAM_INF = '#EXT-X-STREAM-INF:';
const KEY_TAG = '#EXT-X-KEY:';
const MAP_TAG = '#EXT-X-MAP:';
const BYTERANGE_TAG = '#EXT-X-BYTERANGE:';
// First box of an mp4 init section or fragment; a TS init section (PAT/PMT) starts with a sync byte instead.
const MP4_FIRST_BOXES = new Set(['ftyp', 'styp', 'moov', 'moof']);
const UNENCRYPTED_METHOD = 'METHOD=NONE';
const ATTRIBUTE = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
const RESOLUTION = /^(\d+)x(\d+)$/;
const BOX_HEADER_SIZE = 8;
const FULL_BOX_HEADER_SIZE = 12;
// Containers on the way from moov to the boxes that carry a duration.
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia']);
// Offset of the 32-bit duration after the full-box header; mux.js writes these boxes as version 0 only.
const DURATION_OFFSETS = { mvhd: 12, tkhd: 16, mdhd: 12 };
const DURATION_SIZE = 4;
const VERSION_0 = 0;

// Trimmed, non-blank lines; tags and comments stay.
function playlistLines(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function attributes(tagLine) {
  return Object.fromEntries([...tagLine.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, value.replace(/^"|"$/g, '')]));
}

// Master playlist → [{ url, bandwidth, pixels }]; URIs resolved against baseUrl.
export function parseMasterPlaylist(text, baseUrl) {
  const lines = playlistLines(text);
  return lines.flatMap((line, index) => {
    const uri = lines[index + 1];
    if (!line.startsWith(STREAM_INF) || !uri || uri.startsWith('#')) {
      return [];
    }
    const { BANDWIDTH, RESOLUTION: resolution } = attributes(line.slice(STREAM_INF.length));
    const [, width, height] = RESOLUTION.exec(resolution ?? '') ?? [];
    return [{ url: new URL(uri, baseUrl).href, bandwidth: Number(BANDWIDTH) || 0, pixels: (Number(width) * Number(height)) || 0 }];
  });
}

// Highest bandwidth, then most pixels; null without variants.
export function bestVariant(variants) {
  return variants.reduce((best, variant) => (
    !best || variant.bandwidth > best.bandwidth || (variant.bandwidth === best.bandwidth && variant.pixels > best.pixels)
      ? variant : best
  ), null);
}

// '<length>[@<offset>]' → { start, end } (inclusive); without offset the range follows the previous one of that file.
function byteRange(spec, previousEnd) {
  const [length, offset] = spec.split('@').map(Number);
  const start = Number.isFinite(offset) ? offset : previousEnd + 1;
  return { start, end: start + length - 1 };
}

// Media playlist → { segments: [{ url, range? }], map: { url, range? } | null, encrypted }; a master playlist has
// no segments. map is the init section (EXT-X-MAP) of fMP4 streams; range the part of a file (EXT-X-BYTERANGE).
export function parseMediaPlaylist(text, baseUrl) {
  const lines = playlistLines(text);
  const encrypted = lines.some((line) => line.startsWith(KEY_TAG) && !line.includes(UNENCRYPTED_METHOD));
  const rangeEnds = new Map();
  const segments = [];
  let map = null;
  let pendingRange = null;
  lines.forEach((line, index) => {
    if (line.startsWith(MAP_TAG)) {
      const { URI, BYTERANGE } = attributes(line.slice(MAP_TAG.length));
      map = { url: new URL(URI, baseUrl).href, ...(BYTERANGE ? { range: byteRange(BYTERANGE, -1) } : {}) };
    } else if (line.startsWith(BYTERANGE_TAG)) {
      pendingRange = line.slice(BYTERANGE_TAG.length);
    } else if (!line.startsWith('#') && !lines[index - 1]?.startsWith(STREAM_INF)) {
      const url = new URL(line, baseUrl).href;
      const range = pendingRange && byteRange(pendingRange, rangeEnds.get(url) ?? -1);
      if (range) rangeEnds.set(url, range.end);
      segments.push({ url, ...(range ? { range } : {}) });
      pendingRange = null;
    }
  });
  return { segments, map, encrypted };
}

// url with the given query string appended (CloudFront signed-URL parameters).
export function withQuery(url, query) {
  if (!query) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

const boxTypeAt = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset + 4, offset + BOX_HEADER_SIZE));

// mux.js writes 0xFFFFFFFF ("unknown") as movie, track and media duration; AVFoundation (QuickTime) then shows
// a timeline of many hours. Duration 0 is the fragmented-mp4 convention: players add up the fragments.
function clearDurations(bytes, start = 0, end = bytes.length) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = start; offset + BOX_HEADER_SIZE <= end;) {
    const size = view.getUint32(offset);
    if (size < BOX_HEADER_SIZE) {
      return;
    }
    const type = boxTypeAt(bytes, offset);
    if (CONTAINER_BOXES.has(type)) {
      clearDurations(bytes, offset + BOX_HEADER_SIZE, offset + size);
    }
    if (type in DURATION_OFFSETS && bytes[offset + BOX_HEADER_SIZE] === VERSION_0) {
      const durationStart = offset + FULL_BOX_HEADER_SIZE + DURATION_OFFSETS[type];
      bytes.fill(0, durationStart, durationStart + DURATION_SIZE);
    }
    offset += size;
  }
}

// mux.js numbers every movie fragment 0 (its per-track counter), and AVFoundation (QuickTime) then reads only the
// first one: one track, e.g. sound without picture. Fragments are numbered 1, 2, … in file order instead.
function renumberFragments(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sequence = 0;
  for (let offset = 0; offset + BOX_HEADER_SIZE <= bytes.length;) {
    const size = view.getUint32(offset);
    if (size < BOX_HEADER_SIZE) {
      return;
    }
    const child = offset + BOX_HEADER_SIZE;
    if (boxTypeAt(bytes, offset) === 'moof' && boxTypeAt(bytes, child) === 'mfhd') {
      view.setUint32(child + FULL_BOX_HEADER_SIZE, ++sequence);
    }
    offset += size;
  }
}

function concatBytes(parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return bytes;
}

// Movie durations zeroed and fragments numbered, so AVFoundation (QuickTime) plays the whole file.
function playableFragmentedMp4(parts) {
  const mp4 = concatBytes(parts);
  clearDurations(mp4, 0, parts[0].byteLength);
  renumberFragments(mp4);
  return mp4;
}

// An fMP4 init section (ftyp/moov) rather than a TS one.
export function isMp4(bytes) {
  return bytes.byteLength >= BOX_HEADER_SIZE && MP4_FIRST_BOXES.has(boxTypeAt(new Uint8Array(bytes), 0));
}

// fMP4 HLS: init section and segments (ArrayBuffers, in order) → one fragmented mp4; no remux needed.
export function joinFragments(init, segments) {
  return playableFragmentedMp4([init, ...segments]);
}

// MPEG-TS segments (ArrayBuffers, in order) → fragmented mp4 bytes, or null when nothing could be remuxed.
// muxjs: the mux.js global (vendor/mux.min.js) or the npm module.
export function remuxToMp4(segments, muxjs) {
  const transmuxer = new muxjs.mp4.Transmuxer();
  const parts = [];
  transmuxer.on('data', ({ initSegment, data }) => {
    if (parts.length === 0) {
      parts.push(initSegment);
    }
    parts.push(data);
  });
  for (const segment of segments) {
    transmuxer.push(new Uint8Array(segment));
  }
  transmuxer.flush();
  return parts.length > 0 ? playableFragmentedMp4(parts) : null;
}
