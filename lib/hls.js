const STREAM_INF = '#EXT-X-STREAM-INF:';
const KEY_TAG = '#EXT-X-KEY:';
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

// Media playlist → { segments: [url], encrypted }; a master playlist has no segments.
export function parseMediaPlaylist(text, baseUrl) {
  const lines = playlistLines(text);
  const encrypted = lines.some((line) => line.startsWith(KEY_TAG) && !line.includes(UNENCRYPTED_METHOD));
  const segments = lines
    .filter((line, index) => !line.startsWith('#') && !lines[index - 1]?.startsWith(STREAM_INF))
    .map((line) => new URL(line, baseUrl).href);
  return { segments, encrypted };
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
  if (parts.length === 0) {
    return null;
  }
  const mp4 = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    mp4.set(part, offset);
    offset += part.length;
  }
  clearDurations(mp4, 0, parts[0].length);
  renumberFragments(mp4);
  return mp4;
}
