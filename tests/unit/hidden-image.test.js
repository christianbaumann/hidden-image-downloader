import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { albumContext, backgroundImageUrl, colorAlpha, toHiddenImageCandidates, widestSrcsetUrl } from '../../lib/hidden-image.js';
import { Fsk18LockedError } from '../../lib/fsk18.js';
import { NoImageUrlError } from '../../lib/lightbox.js';
import { testUuid } from '../fixtures/album-api.js';

const PAGE_URL = 'https://www.joyclub.de/my_joy/feed/friends/';
const ALBUM_PAGE_URL = 'https://www.joyclub.de/profile/fotoalbum/1000001.testowner.html';
const UUID = testUuid(2);
const WEBP_URL = `https://image-user.feig-partner.de/${UUID}/orig/image_1920_k.webp?c=1`;
const JPG_URL = `https://image-user.feig-partner.de/${UUID}/orig/image_1920_k.jpg?c=1`;
const ALBUM_LINKS = [
  '/profile/fotoalbum/1000001.testowner.html#media_id_0_3001_x',
  '/profile/fotoalbum/1000001.testowner.html#media_id_0_3002_x',
  '/profile/fotoalbum/1000001.testowner.html#media_id_0_3003_x',
];
const NONE = {
  backgroundImage: 'none', backgroundColor: 'rgba(0, 0, 0, 0)', srcset: '', src: '', photoId: null, linkIndex: -1, owner: '', title: '', userName: '', gated: false,
};
const OVERLAY_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

const layer = (overrides) => ({ ...NONE, ...overrides });

describe('backgroundImageUrl', () => {
  test('reads the url of a computed background-image', () => {
    assert.equal(backgroundImageUrl(`url("${WEBP_URL}")`, PAGE_URL), WEBP_URL);
  });

  test('takes the first url of several backgrounds', () => {
    assert.equal(backgroundImageUrl(`linear-gradient(red, blue), url("${WEBP_URL}"), url("x.png")`, PAGE_URL), WEBP_URL);
  });

  test('resolves a relative url against the page', () => {
    assert.equal(backgroundImageUrl('url("/img/a.jpg")', PAGE_URL), 'https://www.joyclub.de/img/a.jpg');
  });

  test('none, empty and data urls give null', () => {
    assert.equal(backgroundImageUrl('none', PAGE_URL), null);
    assert.equal(backgroundImageUrl('url("")', PAGE_URL), null);
    assert.equal(backgroundImageUrl('url("data:image/gif;base64,R0lG")', PAGE_URL), null);
    assert.equal(backgroundImageUrl(undefined, PAGE_URL), null);
  });
});

describe('widestSrcsetUrl', () => {
  test('picks the widest w candidate', () => {
    assert.equal(widestSrcsetUrl('https://x/a_640.jpg 640w, https://x/a_1920.jpg 1920w, https://x/a_1280.jpg 1280w', PAGE_URL),
      'https://x/a_1920.jpg');
  });

  test('picks the highest x candidate, a bare url counts as 1x', () => {
    assert.equal(widestSrcsetUrl('https://x/a.jpg, https://x/a2.jpg 2x', PAGE_URL), 'https://x/a2.jpg');
  });

  test('resolves relative candidates', () => {
    assert.equal(widestSrcsetUrl('/a.jpg 100w', PAGE_URL), 'https://www.joyclub.de/a.jpg');
  });

  test('empty srcset gives null', () => {
    assert.equal(widestSrcsetUrl('', PAGE_URL), null);
    assert.equal(widestSrcsetUrl(undefined, PAGE_URL), null);
  });
});

describe('colorAlpha', () => {
  test('reads the alpha of rgba and treats rgb as opaque', () => {
    assert.equal(colorAlpha('rgba(0, 0, 0, 0.85)'), 0.85);
    assert.equal(colorAlpha('rgba(0, 0, 0, 0)'), 0);
    assert.equal(colorAlpha('rgb(255, 255, 255)'), 1);
    assert.equal(colorAlpha('rgb(0 0 0 / 0.5)'), 0.5);
  });

  test('an unknown or missing value counts as transparent', () => {
    assert.equal(colorAlpha('transparent'), 0);
    assert.equal(colorAlpha(undefined), 0);
  });
});

describe('albumContext', () => {
  const raw = { pageUrl: ALBUM_PAGE_URL, album: 'Fotos von uns', albumLinks: ALBUM_LINKS };

  test('a card in the album grid gets its link position', () => {
    assert.deepEqual(albumContext(raw, { linkIndex: 1, photoId: null }), { album: 'Fotos von uns', position: 2, count: 3 });
  });

  test('a lightbox image is found among the links by its photo id', () => {
    assert.deepEqual(albumContext(raw, { linkIndex: -1, photoId: '3003' }), { album: 'Fotos von uns', position: 3, count: 3 });
  });

  test('an unknown photo id gives no album context', () => {
    assert.deepEqual(albumContext(raw, { linkIndex: -1, photoId: '9999' }), {});
    assert.deepEqual(albumContext(raw, { linkIndex: -1, photoId: null }), {});
  });

  test('pages other than an album page give no album context', () => {
    assert.deepEqual(albumContext({ ...raw, pageUrl: 'https://www.joyclub.de/profile/1000001.testowner.html' }, { linkIndex: 0 }), {});
  });

  test('an album page without a title gives no album context', () => {
    assert.deepEqual(albumContext({ ...raw, album: '' }, { linkIndex: 0 }), {});
  });
});

describe('toHiddenImageCandidates', () => {
  test('skips the overlay and takes the first layer with a background image', () => {
    const raw = {
      pageUrl: PAGE_URL,
      owner: '',
      layers: [layer({}), layer({ backgroundImage: `url("${WEBP_URL}")`, photoId: '1001', owner: 'TestOwner' }),
        layer({ backgroundImage: 'url("https://x/other.jpg")' })],
    };

    assert.deepEqual(toHiddenImageCandidates(raw), [
      { url: JPG_URL, filename: 'TestOwner_00000002.jpg' },
      { url: WEBP_URL, filename: 'TestOwner_00000002.webp' },
    ]);
  });

  test('takes the widest srcset candidate when there is no background image', () => {
    const raw = { pageUrl: PAGE_URL, owner: 'TestOwner', layers: [layer({ srcset: `https://x/a_640.jpg 640w, ${JPG_URL} 1920w` })] };

    assert.deepEqual(toHiddenImageCandidates(raw), [{ url: JPG_URL, filename: 'TestOwner_00000002.jpg' }]);
  });

  test('names an album grid card like its profile ZIP entry', () => {
    const raw = {
      pageUrl: ALBUM_PAGE_URL,
      owner: 'TestOwner',
      album: 'Fotos von uns',
      albumLinks: ALBUM_LINKS,
      layers: [layer({ backgroundImage: `url("${JPG_URL}")`, linkIndex: 1 })],
    };

    assert.deepEqual(toHiddenImageCandidates(raw), [{ url: JPG_URL, filename: 'TestOwner_Fotos-von-uns_02_00000002.jpg' }]);
  });

  test('the layer owner wins over the page owner, the photo id stands in for a url without UUID', () => {
    const raw = {
      pageUrl: PAGE_URL,
      owner: 'PageOwner',
      layers: [layer({ backgroundImage: 'url("https://x/a.jpg")', photoId: '1001', owner: 'SlideOwner' })],
    };

    assert.equal(toHiddenImageCandidates(raw)[0].filename, 'SlideOwner_1001.jpg');
  });

  test('puts the lightbox title of the image layer into the name', () => {
    const raw = {
      pageUrl: PAGE_URL,
      layers: [layer({ title: 'Rück Ansicht' }), layer({ backgroundImage: 'url("https://x/a.jpg")', photoId: '1001', owner: 'SlideOwner', title: 'Rück Ansicht' })],
    };

    assert.equal(toHiddenImageCandidates(raw)[0].filename, 'SlideOwner_Rück-Ansicht_1001.jpg');
  });

  test('a placeholder lightbox title keeps the name without title', () => {
    const raw = { pageUrl: PAGE_URL, layers: [layer({ backgroundImage: 'url("https://x/a.jpg")', photoId: '1001', owner: 'SlideOwner', title: '...' })] };

    assert.equal(toHiddenImageCandidates(raw)[0].filename, 'SlideOwner_1001.jpg');
  });

  test('a titled album card is named like its titled ZIP entry', () => {
    const raw = {
      pageUrl: ALBUM_PAGE_URL,
      owner: 'TestOwner',
      album: 'Fotos von uns',
      albumLinks: ALBUM_LINKS,
      layers: [layer({ backgroundImage: `url("${JPG_URL}")`, linkIndex: 1, title: 'Rück Ansicht' })],
    };

    assert.equal(toHiddenImageCandidates(raw)[0].filename, 'TestOwner_Fotos-von-uns_02_Rück-Ansicht_00000002.jpg');
  });

  test('a backdrop without image hides the photos below it', () => {
    const raw = {
      pageUrl: PAGE_URL,
      owner: 'TestOwner',
      layers: [layer({ backgroundColor: 'rgba(0, 0, 0, 0.85)' }), layer({ backgroundImage: `url("${JPG_URL}")` })],
    };

    assert.throws(() => toHiddenImageCandidates(raw), NoImageUrlError);
  });

  test('an opaque layer with its own image still counts', () => {
    const raw = { pageUrl: PAGE_URL, owner: 'TestOwner', layers: [layer({ backgroundImage: `url("${JPG_URL}")`, backgroundColor: 'rgb(255, 255, 255)' })] };

    assert.equal(toHiddenImageCandidates(raw)[0].url, JPG_URL);
  });

  test('a translucent tint over the photo does not hide it', () => {
    const raw = {
      pageUrl: PAGE_URL,
      owner: 'TestOwner',
      layers: [layer({ backgroundColor: 'rgba(0, 0, 0, 0.3)' }), layer({ backgroundImage: `url("${JPG_URL}")` })],
    };

    assert.equal(toHiddenImageCandidates(raw)[0].url, JPG_URL);
  });

  test('takes the src of a plain image when there is no background image or srcset', () => {
    const raw = { pageUrl: PAGE_URL, owner: 'TestOwner', layers: [layer({ src: OVERLAY_GIF }), layer({ src: JPG_URL })] };

    assert.deepEqual(toHiddenImageCandidates(raw), [{ url: JPG_URL, filename: 'TestOwner_00000002.jpg' }]);
  });

  test('never takes a GIF src: an overlay above nothing has no image', () => {
    const raw = { pageUrl: PAGE_URL, layers: [layer({ src: OVERLAY_GIF }), layer({ src: 'https://www.joyclub.de/spacer.gif?v=1' })] };

    assert.throws(() => toHiddenImageCandidates(raw), NoImageUrlError);
  });

  test('a srcset wins over the src of the same image', () => {
    const raw = { pageUrl: PAGE_URL, owner: 'TestOwner', layers: [layer({ src: 'https://x/small.jpg', srcset: `${JPG_URL} 1920w` })] };

    assert.equal(toHiddenImageCandidates(raw)[0].url, JPG_URL);
  });

  test('the user name of a member card names the owner, before the page owner', () => {
    const raw = { pageUrl: PAGE_URL, owner: 'PageOwner', layers: [layer({ srcset: `${JPG_URL} 720w`, userName: 'CardUser' })] };

    assert.equal(toHiddenImageCandidates(raw)[0].filename, 'CardUser_00000002.jpg');
  });

  test('a gated layer throws Fsk18LockedError instead of saving the pixelated photo', () => {
    const crop = `https://image-user.feig-partner.de/${UUID}/orig/image_180_pxl_k.jpg`;
    const raw = { pageUrl: PAGE_URL, owner: 'TestOwner', layers: [layer({ srcset: `${crop} 180w`, gated: true })] };

    assert.throws(() => toHiddenImageCandidates(raw), Fsk18LockedError);
  });

  test('an ungated small image offers the full size first', () => {
    const crop = `https://image-user.feig-partner.de/${UUID}/orig/image_180_k.jpg`;
    const raw = { pageUrl: PAGE_URL, owner: 'TestOwner', layers: [layer({ srcset: `${crop} 180w` })] };

    assert.deepEqual(toHiddenImageCandidates(raw).map(({ url }) => url), [
      `https://image-user.feig-partner.de/${UUID}/orig/image_1920_k.jpg`, crop,
    ]);
  });

  test('no image layer throws NoImageUrlError', () => {
    assert.throws(() => toHiddenImageCandidates({ pageUrl: PAGE_URL, layers: [layer({}), layer({})] }), NoImageUrlError);
  });

  test('no answer throws NoImageUrlError', () => {
    assert.throws(() => toHiddenImageCandidates(null), NoImageUrlError);
  });
});
