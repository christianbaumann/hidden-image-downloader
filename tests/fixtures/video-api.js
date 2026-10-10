// Synthetic answers of JoyClub's video endpoints (/video/lightbox/list, /video/lightbox/data, /aws/aws_signed_cookies)
// and HLS playlists, shaped like the live ones in research-09-profile-videos.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VIDEO_HOST = 'uservideo.joyclub.de';
export const VIDEO_ORIGIN = `https://${VIDEO_HOST}`;
export const VIDEO_ID_1 = '900001';
export const VIDEO_ID_2 = '900002';
export const SIGNED = { Policy: 'policy-1', Signature: 'signature-1', 'Key-Pair-Id': 'KEYPAIR1' };
export const SIGNED_QUERY = new URLSearchParams(SIGNED).toString();
export const SIGNED_COOKIES = {
  'CloudFront-Policy': SIGNED.Policy,
  'CloudFront-Signature': SIGNED.Signature,
  'CloudFront-Key-Pair-Id': SIGNED['Key-Pair-Id'],
};

export const guidOf = (id) => `00000000-0000-4000-8000-000000${id}`;
export const masterUrlOf = (id) => `${VIDEO_ORIGIN}/${guidOf(id)}/hls/${id}.m3u8`;
export const variantNameOf = (id, height) => `${id}OttHlsTsAvcAac_9x16_${height}p.m3u8`;

// JoyClub escapes the JSON for an HTML attribute: '/' as '\/', quotes as &quot;.
const attribute = (value) => JSON.stringify(value).replaceAll('/', '\\/').replaceAll('"', '&quot;');

// One lightbox_data_list item; source: false gives the answer of a locked FSK18 session (no data-video).
export function videoItem(id, { source = true, blurred = !source } = {}) {
  const guid = guidOf(id);
  const config = { identifier: `user_${guid}`, modus: 'user', payload_json: JSON.stringify({ guid, contest_id: null, preview_mode: false }) };
  const video = source ? ` data-video="${attribute({ video_source: masterUrlOf(id), autoplay: 'autoplay' })}"` : '';
  return {
    media_id: Number(id),
    media_title: 'Beispiel',
    media_fsk18_blurred: blurred,
    media_source: 4,
    media_html: `<div class="video_wrapper"${video} data-cookie-config="${attribute(config)}"><img src="/img/_.gif"></div>`,
  };
}

export const listAnswer = (ids) => ({ status_code: 200, content: { media_key_list: ids.map((id) => `4_${id}`) } });
export const dataAnswer = (items) => ({
  status_code: 200,
  content: { lightbox_data_list: Object.fromEntries(items.map((item) => [String(item.media_id), item])) },
});
export const signedAnswer = () => ({
  status_code: 200,
  content: { cookie_list: SIGNED_COOKIES, domain: 'joyclub.de', path: '/', expires: 'Fri, 09 Oct 2026 17:53:20 GMT' },
});

// The highest variant is listed first on purpose: the extension must pick by bandwidth, not by position.
export function masterPlaylist(id) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-STREAM-INF:BANDWIDTH=415025,AVERAGE-BANDWIDTH=398220,CODECS="avc1.4d401f,mp4a.40.5",RESOLUTION=480x854,FRAME-RATE=29.970',
    variantNameOf(id, 854),
    '#EXT-X-STREAM-INF:BANDWIDTH=111824,AVERAGE-BANDWIDTH=109893,CODECS="avc1.4d400b,mp4a.40.5",RESOLUTION=144x256,FRAME-RATE=14.985',
    variantNameOf(id, 256),
    '',
  ].join('\n');
}

const VIDEO_DIR = new URL('./video/', import.meta.url);
// tests/fixtures/video: 2 s test pattern with tone (ffmpeg testsrc + sine, H.264/AAC), cut into two TS segments.
export const SEGMENT_NAMES = ['seg_0.ts', 'seg_1.ts'];
export const MEDIA_PLAYLIST = readFileSync(fileURLToPath(new URL('media.m3u8', VIDEO_DIR)), 'utf8');
export const segmentBytes = (name) => readFileSync(fileURLToPath(new URL(name, VIDEO_DIR)));
export const ENCRYPTED_MEDIA_PLAYLIST = MEDIA_PLAYLIST.replace(
  '#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
);
