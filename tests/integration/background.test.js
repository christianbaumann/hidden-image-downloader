import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_BASE, albumRaw, listResult, profileTextResult, testUuid } from '../fixtures/album-api.js';
import { ME, ORIGIN, PARTNER, attachmentMessage, textMessage } from '../fixtures/clubmail-api.js';
import { SIGNED_QUERY, VIDEO_ID_1, VIDEO_ID_2, masterUrlOf } from '../fixtures/video-api.js';

const TAB = { id: 7 };
const PROFILE_USER_ID = '1000001';
const PROFILE_TAB = { id: 7, url: `https://www.joyclub.de/profile/${PROFILE_USER_ID}.testowner.html` };
const CONVERSATION_TAB = {
  id: 7,
  url: `https://www.joyclub.de/clubmail/conversation/conversation-wrapper-personal-${ME.id}-${PARTNER.id}/`,
};
const FEED_TAB = { id: 7, url: 'https://www.joyclub.de/fotos/feed/' };
const OTHER_TAB = { id: 8 };
const IMAGE_URL = 'https://cdn.joyclub.de/img/abc_1920.webp?c=1';
const JPG_URL = 'https://cdn.joyclub.de/img/abc_1920.jpg?c=1';
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const DOWNLOAD_ID = 42;
const OWN_EXTENSION_ID = 'own-extension-id';
const OTHER_EXTENSION_ID = 'other-extension-id';
const VALID_DATA = {
  style: `background-image: url("${IMAGE_URL}")`,
  owner: 'Rück: Owner',
  photoId: '1001',
  pageUrl: 'https://www.joyclub.de/profile/1.html',
};
const BLOB_URL = 'blob:chrome-extension://own-extension-id/5f1c';
const ZIP_DOWNLOAD_ID = 43;
const UNRELATED_DOWNLOAD_ID = 99;
const OFFSCREEN_READY_LIMIT = 50;
const PROGRESS_COLOR = '#1a73e8';
const WARNING_COLOR = '#e0a000';

const UNLOCK_TAB_ID = 70;
const PASSWORD = 'e2e-secret-password';
const PROMPT_URL = 'https://identity.joyclub.com/ui/fsk18/challenge/password';
const UNLOCKED_URL = 'https://www.joyclub.de/my_joy/feed/friends/';
const UNLOCK_POLL_MS = 250;
const UNLOCK_STEP_TIMEOUT_MS = 20000;

const MENU_INFO = { menuItemId: 'save-hidden-image', frameId: 0 };
const MENU_TAB = { id: 7, url: 'https://www.joyclub.de/my_joy/feed/friends/' };
const HIDDEN_IMAGE = {
  pageUrl: MENU_TAB.url,
  owner: 'TestOwner',
  album: '',
  albumLinks: [],
  layers: [
    { backgroundImage: 'none', srcset: '', photoId: null, linkIndex: -1, owner: '' },
    { backgroundImage: `url("${IMAGE_URL}")`, srcset: '', photoId: '1001', linkIndex: -1, owner: '' },
  ],
};

const listeners = [];
const installedListeners = [];
const menuListeners = [];
const createdMenus = [];
const filenameListeners = [];
const changedListeners = [];
const messageListeners = [];
let calls;
let extracted;
let executeScript;
let download;
let fetchImpl;
let sendMessage;
let zipResponse;
let zipDownloadIds;
let offscreenOpen;
let offscreenCreating;
let createDocument;
let closeDocument;
let tabMessage;
// tab id → body[data-session-fsk18-status]; readFsk18Status answers undefined for tabs without one.
let fsk18Statuses;
// The prompt tab as chrome.tabs.get reports it; null: closed.
let unlockTab;
let submitPassword;

// chrome.storage area; values are cloned like Chrome serialises them.
function storageArea() {
  let items = {};
  return {
    get: async (key) => (key in items ? { [key]: structuredClone(items[key]) } : {}),
    set: async (values) => {
      items = { ...items, ...structuredClone(values) };
    },
    remove: async (key) => {
      delete items[key];
    },
    items: () => items,
    clear: () => {
      items = {};
    },
  };
}
const localStorageArea = storageArea();
const sessionStorageArea = storageArea();

const record = (name) => async (details) => {
  calls.push([name, details]);
};

globalThis.chrome = {
  runtime: {
    id: OWN_EXTENSION_ID,
    onInstalled: { addListener: (listener) => installedListeners.push(listener) },
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    sendMessage: async (message) => {
      calls.push(['sendMessage', message]);
      return sendMessage(message);
    },
  },
  offscreen: {
    Reason: { BLOBS: 'BLOBS' },
    hasDocument: async () => offscreenOpen,
    createDocument: async (options) => {
      calls.push(['createDocument', options]);
      if (offscreenOpen || offscreenCreating) {
        throw new Error('Only a single offscreen document may be created.');
      }
      offscreenCreating = true;
      try {
        await createDocument(options);
        offscreenOpen = true;
      } finally {
        offscreenCreating = false;
      }
    },
    closeDocument: async () => {
      calls.push(['closeDocument', {}]);
      await closeDocument();
      offscreenOpen = false;
    },
  },
  action: {
    onClicked: { addListener: (listener) => listeners.push(listener) },
    setBadgeText: record('setBadgeText'),
    setBadgeBackgroundColor: record('setBadgeBackgroundColor'),
    setTitle: record('setTitle'),
  },
  contextMenus: {
    create: (options) => createdMenus.push(options),
    onClicked: { addListener: (listener) => menuListeners.push(listener) },
  },
  tabs: {
    sendMessage: async (tabId, message, options) => {
      calls.push(['tabs.sendMessage', { tabId, message, options }]);
      return tabMessage(tabId, message, options);
    },
    create: async (options) => {
      calls.push(['tabs.create', options]);
      return { id: UNLOCK_TAB_ID, url: options.url, status: 'loading' };
    },
    get: async (tabId) => {
      if (tabId !== UNLOCK_TAB_ID || !unlockTab) {
        throw new Error(`No tab with id: ${tabId}.`);
      }
      return unlockTab;
    },
    remove: async (tabId) => {
      calls.push(['tabs.remove', tabId]);
    },
    reload: async (tabId) => {
      calls.push(['tabs.reload', tabId]);
    },
  },
  storage: { local: localStorageArea, session: sessionStorageArea },
  scripting: {
    // The FSK18 functions are answered here, so tests replacing executeScript only deal with the fetchers.
    executeScript: async (options) => {
      if (options.func.name === 'readFsk18Status') {
        return [{ result: fsk18Statuses.get(options.target.tabId) }];
      }
      if (options.func.name === 'submitFsk18Password') {
        calls.push(['submitPassword', options]);
        return submitPassword(options);
      }
      calls.push(['executeScript', options]);
      return executeScript(options);
    },
  },
  downloads: {
    onDeterminingFilename: { addListener: (listener) => filenameListeners.push(listener) },
    onChanged: { addListener: (listener) => changedListeners.push(listener) },
    download: async (options) => {
      calls.push(['download', options]);
      return download(options);
    },
  },
};

globalThis.fetch = async (url, options) => {
  calls.push(['fetch', { url, ...options }]);
  return fetchImpl(url, options);
};

const { handleActionClick, handleMenuClick } = await import('../../background.js');

const callsNamed = (name) => calls.filter(([callName]) => callName === name).map(([, details]) => details);
const LOG_FILENAME = 'hidden-image-downloader-log.txt';
const logDownloads = () => callsNamed('download').filter(({ filename }) => filename === LOG_FILENAME);
const contentDownloads = () => callsNamed('download').filter(({ filename }) => filename !== LOG_FILENAME);
const logText = () => decodeURIComponent(logDownloads()[0].url.split(',').slice(1).join(','));
const lastTitle = () => callsNamed('setTitle').at(-1).title;
const lastBadgeText = () => callsNamed('setBadgeText').at(-1).text;
const injectedFunctions = () => callsNamed('executeScript').map(({ func }) => func.name);
const fireProgress = (jobId, done, total) => messageListeners.forEach((listener) =>
  listener({ target: 'background', action: 'zip-progress', jobId, done, total }));
const badgeTextsOf = (tabId) => callsNamed('setBadgeText').filter((call) => call.tabId === tabId).map(({ text }) => text);
const fireDownloadChanged = (id, state) => changedListeners.forEach((listener) => listener({ id, state: { current: state } }));

// Fires onDeterminingFilename like Chrome; returns the listener's suggestion or undefined.
function determineFilename(item) {
  let suggestion;
  filenameListeners[0](item, (value) => {
    suggestion = value;
  });
  return suggestion;
}

beforeEach(() => {
  mock.restoreAll();
  calls = [];
  extracted = {
    extractLightboxData: VALID_DATA,
    fetchProfileAlbums: albumRaw(),
    fetchClubMailImages: { origin: ORIGIN, messages: [] },
    fetchProfileVideos: { videos: [] },
  };
  executeScript = async ({ func }) => [{ result: extracted[func.name] }];
  zipDownloadIds = [];
  download = async ({ url }) => {
    if (url !== BLOB_URL) {
      return DOWNLOAD_ID;
    }
    const id = ZIP_DOWNLOAD_ID + zipDownloadIds.length;
    zipDownloadIds.push(id);
    return id;
  };
  fetchImpl = async () => ({ ok: true, status: HTTP_OK });
  zipResponse = { url: BLOB_URL, added: 2, missing: [] };
  sendMessage = async ({ action }) => {
    if (!offscreenOpen) {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    return action === 'ping' ? { ready: true } : zipResponse;
  };
  offscreenOpen = false;
  offscreenCreating = false;
  createDocument = async () => {};
  closeDocument = async () => {};
  tabMessage = async () => HIDDEN_IMAGE;
  fsk18Statuses = new Map();
  unlockTab = { id: UNLOCK_TAB_ID, url: PROMPT_URL, status: 'complete' };
  // The right password brings the prompt tab back to JoyClub, unlocked.
  submitPassword = async ({ args: [password] }) => {
    if (password === PASSWORD) {
      unlockTab = { ...unlockTab, url: UNLOCKED_URL };
      fsk18Statuses.set(UNLOCK_TAB_ID, '1');
    }
    return [{ result: true }];
  };
  localStorageArea.clear();
  sessionStorageArea.clear();
  mock.method(console, 'warn', () => {});
});

describe('background registration', () => {
  test('registers one onClicked listener and exposes handleActionClick', () => {
    assert.equal(listeners.length, 1);
    assert.equal(typeof listeners[0], 'function');
    assert.equal(globalThis.handleActionClick, handleActionClick);
  });

  test('registers one onDeterminingFilename listener', () => {
    assert.equal(filenameListeners.length, 1);
  });
});

// Another extension's onDeterminingFilename listener makes Chrome ignore download()'s filename.
describe('onDeterminingFilename', () => {
  test('suggests our filename for our own download', async () => {
    let suggestion;
    download = async ({ url }) => {
      suggestion = determineFilename({ url, byExtensionId: OWN_EXTENSION_ID });
      return DOWNLOAD_ID;
    };

    const result = await handleActionClick(TAB);

    assert.deepEqual(suggestion, { filename: result.filename, conflictAction: 'uniquify' });
  });

  test('leaves downloads of other extensions alone', async () => {
    let suggestion = 'not called';
    download = async ({ url }) => {
      suggestion = determineFilename({ url, byExtensionId: OTHER_EXTENSION_ID });
      return DOWNLOAD_ID;
    };

    await handleActionClick(TAB);

    assert.equal(suggestion, undefined);
  });

  test('leaves user downloads alone', () => {
    assert.equal(determineFilename({ url: JPG_URL }), undefined);
  });

  test('suggests only once per download', async () => {
    download = async ({ url }) => {
      determineFilename({ url, byExtensionId: OWN_EXTENSION_ID });
      return DOWNLOAD_ID;
    };
    await handleActionClick(TAB);

    assert.equal(determineFilename({ url: JPG_URL, byExtensionId: OWN_EXTENSION_ID }), undefined);
  });

  test('forgets the filename when download() rejects', async () => {
    download = async () => {
      throw new Error('Invalid filename');
    };
    await handleActionClick(TAB);

    assert.equal(determineFilename({ url: JPG_URL, byExtensionId: OWN_EXTENSION_ID }), undefined);
  });
});

describe('handleActionClick', () => {
  test('downloads the active image with a sanitised filename', async () => {
    const result = await handleActionClick(TAB);

    const [options] = callsNamed('download');
    assert.equal(options.url, JPG_URL);
    assert.match(options.filename, /^Rück_-Owner_1001\.jpg$/);
    assert.equal(options.conflictAction, 'uniquify');
    assert.equal(options.saveAs, false);
    assert.deepEqual(result, { url: JPG_URL, filename: options.filename, downloadId: DOWNLOAD_ID });
  });

  test('a non-profile JoyClub URL with a lightbox downloads the single image', async () => {
    const result = await handleActionClick(FEED_TAB);

    assert.deepEqual(injectedFunctions(), ['extractLightboxData']);
    assert.equal(result.url, JPG_URL);
  });

  test('a non-profile JoyClub URL without a lightbox shows "no lightbox image or profile photos found"', async () => {
    extracted.extractLightboxData = null;

    assert.equal(await handleActionClick(FEED_TAB), null);
    assert.match(lastTitle(), /no lightbox image or profile photos found/);
    assert.deepEqual(injectedFunctions(), ['extractLightboxData']);
  });

  test('a tab without a URL takes the lightbox path', async () => {
    await handleActionClick(TAB);

    assert.deepEqual(injectedFunctions(), ['extractLightboxData']);
  });

  test('injects the extractor into the clicked tab', async () => {
    await handleActionClick(TAB);

    const [options] = callsNamed('executeScript');
    assert.deepEqual(options.target, { tabId: TAB.id });
    assert.equal(typeof options.func, 'function');
  });

  test('clears badge and title before any work', async () => {
    await handleActionClick(TAB);

    assert.deepEqual(calls.slice(0, 2).map(([name]) => name).sort(), ['setBadgeText', 'setTitle']);
    assert.equal(callsNamed('setBadgeText')[0].text, '');
    assert.equal(callsNamed('setTitle')[0].title, 'Download hidden image');
    assert.equal(callsNamed('setBadgeText').length, 1);
  });

  test('unsupported page shows badge and JoyClub hint, no download', async () => {
    executeScript = async () => {
      throw new Error('Cannot access contents of the page');
    };

    const result = await handleActionClick(TAB);

    assert.equal(result, null);
    assert.equal(lastBadgeText(), '!');
    assert.match(lastTitle(), /^Hidden Image Downloader: .*JoyClub pages only/);
    assert.equal(contentDownloads().length, 0);
  });

  test('neither lightbox nor profile photos shows "no lightbox image or profile photos found"', async () => {
    executeScript = async () => [{ result: null }];

    assert.equal(await handleActionClick(TAB), null);
    assert.equal(lastBadgeText(), '!');
    assert.match(lastTitle(), /no lightbox image or profile photos found/);
    assert.equal(contentDownloads().length, 0);
    assert.equal(callsNamed('createDocument').length, 0);
  });

  test('missing image URL shows "image address not found"', async () => {
    executeScript = async () => [{ result: { ...VALID_DATA, style: 'opacity: 1' } }];

    assert.equal(await handleActionClick(TAB), null);
    assert.match(lastTitle(), /image address not found/);
    assert.equal(contentDownloads().length, 0);
  });

  test('download rejection shows "download failed"', async () => {
    download = async () => {
      throw new Error('Invalid filename');
    };

    assert.equal(await handleActionClick(TAB), null);
    assert.equal(lastBadgeText(), '!');
    assert.match(lastTitle(), /download failed/);
  });

  test('error badge has the error colour', async () => {
    executeScript = async () => [{ result: null }];

    await handleActionClick(TAB);

    assert.deepEqual(callsNamed('setBadgeBackgroundColor'), [{ tabId: TAB.id, color: '#d00000' }]);
  });

  test('successful click after an error clears the badge', async () => {
    executeScript = async () => [{ result: null }];
    await handleActionClick(TAB);
    executeScript = async () => [{ result: VALID_DATA }];
    calls = [];

    await handleActionClick(TAB);

    assert.equal(lastBadgeText(), '');
    assert.equal(lastTitle(), 'Download hidden image');
  });

  test('badge calls are scoped to the clicked tab', async () => {
    executeScript = async () => [{ result: null }];
    await handleActionClick(TAB);
    await handleActionClick(OTHER_TAB);

    const split = calls.findIndex(([, details]) => details.tabId === OTHER_TAB.id);
    const badgeTabIds = (clickCalls) => clickCalls.filter(([name]) => name.startsWith('set')).map(([, { tabId }]) => tabId);
    assert.deepEqual(new Set(badgeTabIds(calls.slice(0, split))), new Set([TAB.id]));
    assert.deepEqual(new Set(badgeTabIds(calls.slice(split))), new Set([OTHER_TAB.id]));
  });

  test('logs only the reason, no URL or title', async () => {
    executeScript = async () => [{ result: { ...VALID_DATA, style: 'opacity: 1' } }];

    await handleActionClick(TAB);

    assert.deepEqual(console.warn.mock.calls.map((call) => call.arguments), [['image address not found']]);
  });

  test('closed tab: failing badge calls do not reject the click', async () => {
    const closedTab = async () => {
      throw new Error('No tab with id: 7.');
    };
    mock.method(chrome.action, 'setBadgeText', closedTab);
    mock.method(chrome.action, 'setTitle', closedTab);
    executeScript = closedTab;

    assert.equal(await handleActionClick(TAB), null);
  });
});

describe('jpg probe', () => {
  test('probes the jpg with HEAD, credentials and a timeout signal', async () => {
    await handleActionClick(TAB);

    const [probe] = callsNamed('fetch');
    assert.equal(probe.url, JPG_URL);
    assert.equal(probe.method, 'HEAD');
    assert.equal(probe.credentials, 'include');
    assert.ok(probe.signal instanceof AbortSignal);
  });

  test('missing jpg falls back to the original webp', async () => {
    fetchImpl = async () => ({ ok: false, status: HTTP_NOT_FOUND });

    const result = await handleActionClick(TAB);

    assert.equal(result.url, IMAGE_URL);
    assert.match(result.filename, /\.webp$/);
    assert.equal(callsNamed('download')[0].url, IMAGE_URL);
  });

  test('failing probe falls back to the original webp', async () => {
    fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };

    const result = await handleActionClick(TAB);

    assert.equal(result.url, IMAGE_URL);
    assert.match(result.filename, /\.webp$/);
  });

  test('failing probe logs a warning without the URL', async () => {
    fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };

    await handleActionClick(TAB);

    assert.deepEqual(console.warn.mock.calls.map((call) => call.arguments), [['probe failed']]);
  });

  test('a missing full size falls back to the jpg sibling of a crop', async () => {
    const crop = 'https://image-user.feig-partner.de/00000002-1111-4111-8111-111111111111/1-1/image_720_k.webp?c=1';
    const fullSize = 'https://image-user.feig-partner.de/00000002-1111-4111-8111-111111111111/orig/image_1920_k.jpg';
    const cropJpg = crop.replace('.webp', '.jpg');
    executeScript = async () => [{ result: { ...VALID_DATA, style: `background-image: url("${crop}")` } }];
    fetchImpl = async (url) => (url === fullSize ? { ok: false, status: HTTP_NOT_FOUND } : { ok: true, status: HTTP_OK });

    const result = await handleActionClick(TAB);

    assert.deepEqual(callsNamed('fetch').map(({ url }) => url), [fullSize, cropJpg]);
    assert.equal(result.url, cropJpg);
    assert.equal(callsNamed('download')[0].url, cropJpg);
  });

  test('suggests the webp filename after a fallback', async () => {
    fetchImpl = async () => ({ ok: false, status: HTTP_NOT_FOUND });
    let suggestion;
    download = async ({ url }) => {
      suggestion = determineFilename({ url, byExtensionId: OWN_EXTENSION_ID });
      return DOWNLOAD_ID;
    };

    const result = await handleActionClick(TAB);

    assert.match(result.filename, /\.webp$/);
    assert.deepEqual(suggestion, { filename: result.filename, conflictAction: 'uniquify' });
  });

  test('a jpg lightbox image downloads without a probe', async () => {
    const jpgOnly = { ...VALID_DATA, style: `background-image: url("${JPG_URL}")` };
    executeScript = async () => [{ result: jpgOnly }];

    const result = await handleActionClick(TAB);

    assert.equal(callsNamed('fetch').length, 0);
    assert.equal(result.url, JPG_URL);
  });
});

describe('profile ZIP', () => {
  // Finishes every ZIP download so no open job leaks into the next test.
  afterEach(async () => {
    zipDownloadIds.forEach((id) => fireDownloadChanged(id, 'complete'));
    await new Promise(setImmediate);
  });

  test('a profile URL injects the album, ClubMail and video fetchers, with the user id', async () => {
    await handleActionClick(PROFILE_TAB);

    const options = callsNamed('executeScript');
    assert.deepEqual(injectedFunctions(), ['fetchProfileAlbums', 'fetchClubMailImages', 'fetchProfileVideos']);
    assert.ok(options.every(({ target }) => target.tabId === PROFILE_TAB.id));
    assert.deepEqual(options.map(({ args }) => args), [[PROFILE_USER_ID], [[PROFILE_USER_ID]], [PROFILE_USER_ID]]);
  });

  test('runs all fetchers in parallel', async () => {
    const started = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    executeScript = async ({ func }) => {
      started.push(func.name);
      if (started.length === 2) {
        release();
      }
      await gate;
      return [{ result: extracted[func.name] }];
    };

    await handleActionClick(PROFILE_TAB);

    assert.deepEqual(started, ['fetchProfileAlbums', 'fetchClubMailImages', 'fetchProfileVideos']);
  });

  test('adds the ClubMail attachments to the album ZIP', async () => {
    extracted.fetchClubMailImages = { origin: ORIGIN, messages: [attachmentMessage('11', 'a1')] };

    await handleActionClick(PROFILE_TAB);

    const build = callsNamed('sendMessage').at(-1);
    assert.equal(build.entries.at(-1).name, 'ClubMail/TestOwner_ClubMail_01_a1.jpg');
    assert.match(build.entries.at(-1).url, /^https:\/\/www\.joyclub\.de\/clubmailv3\/attachment\/download\/\?/);
  });

  test('a failed ClubMail fetch shows the amber warning with its reason, the album ZIP still downloads', async () => {
    extracted.fetchClubMailImages = { failed: true, reason: 'HTTP 500' };

    const result = await handleActionClick(PROFILE_TAB);

    assert.equal(result.downloadId, ZIP_DOWNLOAD_ID);
    assert.equal(callsNamed('sendMessage').at(-1).reports[0].text, 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\nClubMail: unavailable (HTTP 500)\n');
    assert.equal(lastBadgeText(), '!');
    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: WARNING_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: ClubMail unavailable (HTTP 500)');
  });

  test('a failed video list shows the amber warning with its reason and writes log.txt, the ZIP still downloads', async () => {
    extracted.fetchProfileVideos = { failed: true, reason: 'HTTP 500' };

    const result = await handleActionClick(PROFILE_TAB);

    assert.equal(result.downloadId, ZIP_DOWNLOAD_ID);
    const build = callsNamed('sendMessage').find(({ action }) => action === 'build-zip');
    assert.equal(build.reports[0].text, 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\nVideos: unavailable (HTTP 500)\n');
    assert.equal(build.warning, true);
    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: WARNING_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: videos unavailable (HTTP 500)');
  });

  test('ClubMail and videos failing together name both on the badge', async () => {
    extracted.fetchClubMailImages = { failed: true, reason: 'HTTP 500' };
    executeScript = async ({ func }) => (func.name === 'fetchProfileVideos' ? [{ result: undefined }] : [{ result: extracted[func.name] }]);

    await handleActionClick(PROFILE_TAB);

    assert.equal(lastTitle(), 'Hidden Image Downloader: ClubMail unavailable (HTTP 500); videos unavailable (extension could not run on the page)');
  });

  for (const [name, inject] of Object.entries({
    'a failing ClubMail injection': () => { throw new Error('Frame was removed'); },
    'a ClubMail injection without result': () => [{ result: undefined }],
  })) {
    test(`${name} warns but still downloads the album ZIP`, async () => {
      executeScript = async ({ func }) => (func.name === 'fetchClubMailImages' ? inject() : [{ result: extracted[func.name] }]);

      const result = await handleActionClick(PROFILE_TAB);

      assert.equal(result.downloadId, ZIP_DOWNLOAD_ID);
      assert.equal(lastTitle(), 'Hidden Image Downloader: ClubMail unavailable (extension could not run on the page)');
      assert.match(callsNamed('sendMessage').at(-1).reports[0].text, /\nClubMail: unavailable \(extension could not run on the page\)\n$/);
    });
  }

  test('missing photos and a failed ClubMail fetch share one tooltip', async () => {
    extracted.fetchClubMailImages = { failed: true, reason: 'HTTP 500' };
    zipResponse = { url: BLOB_URL, added: 1, missing: ['https://image-user.feig-partner.de/x.jpg'] };

    await handleActionClick(PROFILE_TAB);

    assert.equal(lastTitle(), 'Hidden Image Downloader: 1 of 2 files missing; ClubMail unavailable (HTTP 500)');
  });

  test('builds the ZIP offscreen and downloads its blob URL', async () => {
    const result = await handleActionClick(PROFILE_TAB);

    const [created] = callsNamed('createDocument');
    assert.equal(created.url, 'offscreen.html');
    assert.deepEqual(created.reasons, ['BLOBS']);
    const messages = callsNamed('sendMessage');
    assert.deepEqual(messages[0], { target: 'offscreen', action: 'ping' });
    const build = messages.at(-1);
    assert.equal(build.target, 'offscreen');
    assert.equal(build.action, 'build-zip');
    assert.deepEqual(build.entries.map(({ name }) => name), [
      'Fotos-von-uns/TestOwner_Fotos-von-uns_01_00000001.jpg',
      'Aktuelles/TestOwner_Aktuelles_01_00000002.jpg',
    ]);
    assert.deepEqual(build.reports.filter(({ name }) => name === 'skipped.txt'), [{ name: 'skipped.txt', text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\n' }]);
    const [options] = callsNamed('download');
    assert.equal(options.url, BLOB_URL);
    assert.match(options.filename, /^TestOwner\.zip$/);
    assert.equal(`${build.root}.zip`, options.filename);
    assert.deepEqual(result, {
      url: BLOB_URL, filename: options.filename, downloadId: ZIP_DOWNLOAD_ID, added: 2, missing: [],
    });
    assert.equal(lastBadgeText(), '');
  });

  test('a profile URL with a lightbox open still takes the album path', async () => {
    extracted.extractLightboxData = VALID_DATA;

    await handleActionClick(PROFILE_TAB);

    assert.equal(injectedFunctions().includes('extractLightboxData'), false);
    assert.equal(callsNamed('download')[0].url, BLOB_URL);
  });

  for (const url of [
    'https://www.joyclub.de/profile/fotos/1000001.testowner.html',
    'https://www.joyclub.de/profile/fotoalbum/1000001-201.testowner.html',
  ]) {
    test(`takes the album path on ${new URL(url).pathname}`, async () => {
      await handleActionClick({ ...PROFILE_TAB, url });

      assert.deepEqual(injectedFunctions(), ['fetchProfileAlbums', 'fetchClubMailImages', 'fetchProfileVideos']);
      assert.equal(callsNamed('download')[0].url, BLOB_URL);
    });
  }

  test('makes no fetch from the service worker', async () => {
    await handleActionClick(PROFILE_TAB);

    assert.equal(callsNamed('fetch').length, 0);
  });

  test('a failed album fetch shows "album list unavailable", no document, no download', async () => {
    extracted.fetchProfileAlbums = { failed: true };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.equal(lastBadgeText(), '!');
    assert.equal(lastTitle(), 'Hidden Image Downloader: album list unavailable');
    assert.equal(callsNamed('createDocument').length, 0);
    assert.equal(contentDownloads().length, 0);
  });

  test('a failing injection on a profile URL shows the JoyClub hint', async () => {
    executeScript = async () => {
      throw new Error('Cannot access contents of the page');
    };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /JoyClub pages only/);
  });

  test('only restricted albums show "no lightbox image or profile photos found", no document', async () => {
    extracted.fetchProfileAlbums = albumRaw({
      list: listResult({ albums: [{ id: '202', title: 'Lady', restricted: true, imageCount: 9 }] }),
      sources: [],
    });

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /no lightbox image or profile photos found/);
    assert.equal(callsNamed('createDocument').length, 0);
  });

  test('reuses an existing offscreen document', async () => {
    offscreenOpen = true;

    await handleActionClick(PROFILE_TAB);

    assert.equal(callsNamed('createDocument').length, 0);
    assert.equal(callsNamed('download')[0].url, BLOB_URL);
  });

  test('missing photos show the amber warning, the ZIP still downloads', async () => {
    const missingUrl = 'https://image-user.feig-partner.de/x.jpg';
    zipResponse = { url: BLOB_URL, added: 1, missing: [missingUrl] };

    const result = await handleActionClick(PROFILE_TAB);

    assert.equal(result.downloadId, ZIP_DOWNLOAD_ID);
    assert.deepEqual(result.missing, [missingUrl]);
    assert.equal(lastBadgeText(), '!');
    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: WARNING_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: 1 of 2 files missing');
  });

  test('a successful click after a warning clears the badge', async () => {
    zipResponse = { url: BLOB_URL, added: 1, missing: ['https://image-user.feig-partner.de/x.jpg'] };
    await handleActionClick(PROFILE_TAB);
    zipResponse = { url: BLOB_URL, added: 2, missing: [] };
    calls = [];

    await handleActionClick(PROFILE_TAB);

    assert.equal(lastBadgeText(), '');
    assert.equal(lastTitle(), 'Download hidden image');
  });

  test('all photos failing shows "download failed" and closes the document', async () => {
    zipResponse = { url: null, added: 0, missing: ['a', 'b'] };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /download failed/);
    assert.equal(contentDownloads().length, 0);
    assert.equal(callsNamed('closeDocument').length, 1);
  });

  test('an offscreen error shows "download failed" and closes the document', async () => {
    zipResponse = { error: 'boom' };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /download failed/);
    assert.equal(callsNamed('closeDocument').length, 1);
  });

  test('an empty offscreen error shows "download failed" without a download', async () => {
    zipResponse = { error: '' };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /download failed/);
    assert.equal(contentDownloads().length, 0);
  });

  test('a double click creates the document once and downloads both ZIPs', async () => {
    const results = await Promise.all([handleActionClick(PROFILE_TAB), handleActionClick(PROFILE_TAB)]);

    assert.equal(callsNamed('createDocument').length, 1);
    assert.deepEqual(results.map(({ downloadId }) => downloadId), zipDownloadIds);
  });

  test('a click during a pending close keeps a document open for its download', async () => {
    await handleActionClick(PROFILE_TAB);
    let releaseClose;
    closeDocument = () => new Promise((resolve) => {
      releaseClose = resolve;
      closeDocument = async () => {};
    });
    fireDownloadChanged(zipDownloadIds[0], 'complete');
    await new Promise(setImmediate);

    const secondClick = handleActionClick(PROFILE_TAB);
    await new Promise(setImmediate);
    releaseClose();
    const result = await secondClick;
    await new Promise(setImmediate);

    assert.equal(result.downloadId, zipDownloadIds[1]);
    assert.equal(offscreenOpen, true);
  });

  test('a failing createDocument shows "download failed"', async () => {
    createDocument = async () => {
      throw new Error('Only a single offscreen document may be created');
    };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /download failed/);
    assert.equal(contentDownloads().length, 0);
  });

  test('an offscreen document that never answers the ping shows "download failed"', async () => {
    mock.method(globalThis, 'setTimeout', (callback) => queueMicrotask(callback));
    sendMessage = async () => undefined;

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /download failed/);
    assert.equal(callsNamed('sendMessage').length, OFFSCREEN_READY_LIMIT);
    assert.equal(contentDownloads().length, 0);
  });

  test('a rejected ZIP download shows "download failed", closes the document and forgets the filename', async () => {
    download = async () => {
      throw new Error('Invalid filename');
    };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    assert.match(lastTitle(), /download failed/);
    assert.equal(callsNamed('closeDocument').length, 1);
    assert.equal(determineFilename({ url: BLOB_URL, byExtensionId: OWN_EXTENSION_ID }), undefined);
  });

  test('suggests the ZIP name for the blob URL', async () => {
    let suggestion;
    const stubDownload = download;
    download = async (options) => {
      suggestion = determineFilename({ url: options.url, byExtensionId: OWN_EXTENSION_ID });
      return stubDownload(options);
    };

    const result = await handleActionClick(PROFILE_TAB);

    assert.deepEqual(suggestion, { filename: result.filename, conflictAction: 'uniquify' });
  });

  for (const state of ['complete', 'interrupted']) {
    test(`closes the document once the ZIP download is ${state}`, async () => {
      await handleActionClick(PROFILE_TAB);
      assert.equal(callsNamed('closeDocument').length, 0);

      fireDownloadChanged(ZIP_DOWNLOAD_ID, state);
      fireDownloadChanged(ZIP_DOWNLOAD_ID, state);
      await new Promise(setImmediate);

      assert.equal(callsNamed('closeDocument').length, 1);
    });
  }

  test('keeps the document open while the download is in progress', async () => {
    await handleActionClick(PROFILE_TAB);

    fireDownloadChanged(ZIP_DOWNLOAD_ID, 'in_progress');
    await new Promise(setImmediate);

    assert.equal(callsNamed('closeDocument').length, 0);
  });

  test('ignores changes of unrelated downloads', async () => {
    await handleActionClick(PROFILE_TAB);

    fireDownloadChanged(UNRELATED_DOWNLOAD_ID, 'complete');
    await new Promise(setImmediate);

    assert.equal(callsNamed('closeDocument').length, 0);
  });

  test('overlapping ZIP downloads close the document after the last one', async () => {
    await handleActionClick(PROFILE_TAB);
    await handleActionClick(PROFILE_TAB);
    const [firstId, secondId] = zipDownloadIds;

    fireDownloadChanged(firstId, 'complete');
    await new Promise(setImmediate);
    assert.equal(callsNamed('closeDocument').length, 0);

    fireDownloadChanged(secondId, 'complete');
    await new Promise(setImmediate);
    assert.equal(callsNamed('closeDocument').length, 1);
  });
});

describe('ClubMail conversation ZIP', () => {
  afterEach(async () => {
    zipDownloadIds.forEach((id) => fireDownloadChanged(id, 'complete'));
    await new Promise(setImmediate);
  });

  beforeEach(() => {
    extracted.fetchClubMailImages = {
      origin: ORIGIN,
      partnerId: PARTNER.id,
      messages: [textMessage('10', { from: ME }), attachmentMessage('11', 'a1')],
    };
  });

  test('a conversation URL injects only the ClubMail fetcher, with both URL ids', async () => {
    await handleActionClick(CONVERSATION_TAB);

    assert.deepEqual(injectedFunctions(), ['fetchClubMailImages']);
    assert.deepEqual(callsNamed('executeScript')[0].args, [[ME.id, PARTNER.id]]);
  });

  test('builds a ClubMail-only ZIP named after the partner', async () => {
    const result = await handleActionClick(CONVERSATION_TAB);

    const build = callsNamed('sendMessage').find(({ action }) => action === 'build-zip');
    assert.deepEqual(build.entries.map(({ name }) => name), ['ClubMail/TestOwner_ClubMail_01_a1.jpg']);
    assert.deepEqual(build.reports.map(({ name }) => name), ['ClubMail/conversation.md', 'ClubMail/conversation.html']);
    assert.match(result.filename, /^TestOwner_ClubMail\.zip$/);
    assert.equal(`${build.root}.zip`, result.filename);
    assert.equal(lastBadgeText(), '');
  });

  test('a conversation without attachments downloads a ZIP of the transcripts only', async () => {
    extracted.fetchClubMailImages = { origin: ORIGIN, partnerId: PARTNER.id, messages: [textMessage('10')] };

    const result = await handleActionClick(CONVERSATION_TAB);

    const build = callsNamed('sendMessage').find(({ action }) => action === 'build-zip');
    assert.deepEqual(build.entries, []);
    assert.equal(build.reports.length, 2);
    assert.match(result.filename, /^TestOwner_ClubMail\.zip$/);
  });

  test('the API phase shows 0 % and then 10 %', async () => {
    await handleActionClick(CONVERSATION_TAB);

    assert.deepEqual(badgeTextsOf(CONVERSATION_TAB.id).slice(0, 3), ['', '0%', '10%']);
  });

  const failures = {
    'a failed ClubMail fetch': [
      () => [{ result: { failed: true, reason: 'not your conversation' } }],
      'Hidden Image Downloader: ClubMail unavailable (not your conversation)',
    ],
    'a failing injection': [
      () => { throw new Error('Frame was removed'); },
      'Hidden Image Downloader: ClubMail unavailable (extension could not run on the page)',
    ],
    'an injection without result': [
      () => [{ result: undefined }],
      'Hidden Image Downloader: ClubMail unavailable (extension could not run on the page)',
    ],
    'a failed ClubMail fetch without a reason': [
      () => [{ result: { failed: true } }],
      'Hidden Image Downloader: ClubMail unavailable',
    ],
  };
  for (const [name, [inject, title]] of Object.entries(failures)) {
    test(`${name} shows the red badge "ClubMail unavailable", no document`, async () => {
      executeScript = inject;

      assert.equal(await handleActionClick(CONVERSATION_TAB), null);

      assert.equal(lastTitle(), title);
      assert.equal(callsNamed('setBadgeBackgroundColor').at(-1).color, '#d00000');
      assert.equal(callsNamed('createDocument').length, 0);
    });
  }

  test('an empty conversation shows "no lightbox image or profile photos found"', async () => {
    extracted.fetchClubMailImages = { origin: ORIGIN, messages: [] };

    assert.equal(await handleActionClick(CONVERSATION_TAB), null);

    assert.equal(lastTitle(), 'Hidden Image Downloader: no lightbox image or profile photos found');
    assert.equal(callsNamed('createDocument').length, 0);
  });
});

describe('ZIP progress badge', () => {
  afterEach(async () => {
    zipDownloadIds.forEach((id) => fireDownloadChanged(id, 'complete'));
    await new Promise(setImmediate);
  });

  // Answers build-zip after onBuild(message) ran, so progress can arrive while the job is open.
  function buildWith(onBuild) {
    sendMessage = async (message) => {
      if (message.action === 'ping') {
        return { ready: true };
      }
      await onBuild(message);
      return zipResponse;
    };
  }

  test('the API phase shows 0 %, 3 %, 6 % and then 10 % in blue', async () => {
    await handleActionClick(PROFILE_TAB);

    assert.deepEqual(badgeTextsOf(PROFILE_TAB.id).slice(0, 5), ['', '0%', '3%', '6%', '10%']);
    assert.equal(callsNamed('setBadgeBackgroundColor')[0].color, PROGRESS_COLOR);
    assert.equal(callsNamed('setTitle')[1].title, 'Hidden Image Downloader: loading album list, videos and ClubMail');
  });

  test('photo progress shows the count and "n of m files" in blue', async () => {
    buildWith(({ jobId }) => fireProgress(jobId, 1, 2));

    await handleActionClick(PROFILE_TAB);

    assert.ok(calls.some(([name, details]) => name === 'setBadgeText' && details.text === '1/2'));
    assert.ok(callsNamed('setTitle').some(({ title }) => title === 'Hidden Image Downloader: 1 of 2 files'));
    assert.ok(callsNamed('setBadgeBackgroundColor').every(({ color }) => color === PROGRESS_COLOR));
  });

  test('a long count shows the overall percentage', async () => {
    buildWith(({ jobId }) => fireProgress(jobId, 10, 80));

    await handleActionClick(PROFILE_TAB);

    assert.ok(badgeTextsOf(PROFILE_TAB.id).includes('21%'));
  });

  test('a complete ZIP ends with an empty badge and the default title', async () => {
    buildWith(({ jobId }) => fireProgress(jobId, 2, 2));

    await handleActionClick(PROFILE_TAB);

    assert.equal(lastBadgeText(), '');
    assert.equal(lastTitle(), 'Download hidden image');
  });

  test('missing photos replace the progress with the amber warning', async () => {
    buildWith(({ jobId }) => fireProgress(jobId, 2, 2));
    zipResponse = { url: BLOB_URL, added: 1, missing: ['https://image-user.feig-partner.de/x.jpg'] };

    await handleActionClick(PROFILE_TAB);

    assert.equal(lastBadgeText(), '!');
    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: WARNING_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: 1 of 2 files missing');
  });

  test('two ZIP jobs at once update the badges of their own tabs only', async () => {
    const otherProfileTab = { ...PROFILE_TAB, id: OTHER_TAB.id };
    const builds = [];
    let releaseBuilds;
    const bothBuilding = new Promise((resolve) => {
      releaseBuilds = resolve;
    });
    buildWith(async (message) => {
      builds.push(message);
      if (builds.length === 2) {
        releaseBuilds();
      }
      await bothBuilding;
      fireProgress(message.jobId, 1, message.entries.length);
    });
    extracted.fetchProfileAlbums = albumRaw();
    const oneAlbum = albumRaw({ list: listResult({ main: ['101'] }) });
    executeScript = async ({ func, target }) => [{
      result: target.tabId === otherProfileTab.id && func.name === 'fetchProfileAlbums' ? oneAlbum : extracted[func.name],
    }];

    await Promise.all([handleActionClick(PROFILE_TAB), handleActionClick(otherProfileTab)]);

    assert.notEqual(builds[0].jobId, builds[1].jobId);
    assert.ok(badgeTextsOf(PROFILE_TAB.id).includes('1/2'));
    assert.equal(badgeTextsOf(PROFILE_TAB.id).includes('1/1'), false);
    assert.ok(badgeTextsOf(otherProfileTab.id).includes('1/1'));
    assert.equal(badgeTextsOf(otherProfileTab.id).includes('1/2'), false);
  });

  test('a fetcher resolving after another one failed leaves the error badge alone', async () => {
    let releaseClubMail;
    const clubMailPending = new Promise((resolve) => {
      releaseClubMail = resolve;
    });
    executeScript = async ({ func }) => {
      if (func.name === 'fetchProfileAlbums') {
        throw new Error('Cannot access contents of the page');
      }
      await clubMailPending;
      return [{ result: extracted[func.name] }];
    };

    assert.equal(await handleActionClick(PROFILE_TAB), null);
    releaseClubMail();
    await new Promise(setImmediate);

    assert.equal(lastBadgeText(), '!');
    assert.match(lastTitle(), /JoyClub pages only/);
    assert.equal(badgeTextsOf(PROFILE_TAB.id).includes('3%'), false);
  });

  test('an unexpected error clears the progress badge before it propagates', async () => {
    extracted.fetchProfileAlbums = albumRaw({ list: { __typename: 'ProfileAlbumListByUserIdSuccess', regularAlbumResultList: 1 } });

    await assert.rejects(handleActionClick(PROFILE_TAB), TypeError);
    assert.equal(lastBadgeText(), '');
    assert.equal(lastTitle(), 'Download hidden image');
  });

  test('progress after the job has ended is ignored', async () => {
    let jobId;
    buildWith((message) => {
      jobId = message.jobId;
    });
    await handleActionClick(PROFILE_TAB);
    calls = [];

    fireProgress(jobId, 1, 2);
    fireProgress(jobId + 1, 1, 2);

    assert.equal(callsNamed('setBadgeText').length, 0);
  });

  test('ignores messages for other targets', async () => {
    let jobId;
    buildWith((message) => {
      jobId = message.jobId;
      calls = [];
      messageListeners.forEach((listener) => listener({ target: 'offscreen', action: 'zip-progress', jobId, done: 1, total: 2 }));
    });

    await handleActionClick(PROFILE_TAB);

    assert.equal(badgeTextsOf(PROFILE_TAB.id).includes('1/2'), false);
  });
});

describe('failure log', () => {
  afterEach(async () => {
    zipDownloadIds.forEach((id) => fireDownloadChanged(id, 'complete'));
    await new Promise(setImmediate);
  });

  test('a red badge downloads the log, which names the path and the reason', async () => {
    executeScript = async () => {
      throw new Error('Cannot access contents of the page');
    };

    await handleActionClick({ id: 7, url: 'https://example.com/page?session=secret' });

    const [options] = logDownloads();
    assert.equal(options.filename, LOG_FILENAME);
    assert.match(options.url, /^data:text\/plain;charset=utf-8,/);
    assert.match(logText(), /path: lightbox {2}url=https:\/\/example\.com\/page\n/);
    assert.match(logText(), /error: UnsupportedPageError {2}reason=works on JoyClub pages only/);
    assert.doesNotMatch(logText(), /secret/);
  });

  test('the log download gets its name through onDeterminingFilename', async () => {
    let suggestion;
    executeScript = async () => [{ result: null }];
    download = async ({ url }) => {
      suggestion = determineFilename({ url, byExtensionId: OWN_EXTENSION_ID });
      return DOWNLOAD_ID;
    };

    await handleActionClick(TAB);

    assert.deepEqual(suggestion, { filename: LOG_FILENAME, conflictAction: 'uniquify' });
  });

  test('logs probe status and URLs without query', async () => {
    fetchImpl = async () => ({ ok: false, status: HTTP_NOT_FOUND });
    download = async ({ filename }) => {
      if (filename !== LOG_FILENAME) {
        throw new Error('Invalid filename');
      }
      return DOWNLOAD_ID;
    };

    await handleActionClick(TAB);

    assert.match(logText(), /probe {2}status=404 {2}url=https:\/\/cdn\.joyclub\.de\/img\/abc_1920\.jpg\n/);
    assert.match(logText(), /error: DownloadFailedError {2}reason=download failed/);
    assert.doesNotMatch(logText(), /\?c=1/);
  });

  test('a ClubMail failure logs its reason, but no message text', async () => {
    extracted.fetchClubMailImages = {
      origin: ORIGIN, partnerId: PARTNER.id, messages: [textMessage('10', { content: 'very private words' })],
    };
    sendMessage = async () => {
      throw new Error('Could not establish connection.');
    };

    await handleActionClick(CONVERSATION_TAB);

    assert.match(logText(), /clubmail: 1 messages/);
    assert.match(logText(), /error: DownloadFailedError/);
    assert.doesNotMatch(logText(), /private/);
  });

  test('a failed album fetch is logged', async () => {
    extracted.fetchProfileAlbums = { failed: true };
    extracted.fetchClubMailImages = { failed: true, reason: 'timeout' };

    await handleActionClick(PROFILE_TAB);

    assert.match(logText(), /path: profile/);
    assert.match(logText(), /albums: failed/);
    assert.match(logText(), /clubmail: failed {2}reason=timeout/);
    assert.match(logText(), /error: AlbumApiError {2}reason=album list unavailable/);
  });

  test('an unexpected exception downloads the log and still propagates', async () => {
    extracted.fetchProfileAlbums = albumRaw({ list: { __typename: 'ProfileAlbumListByUserIdSuccess', regularAlbumResultList: 1 } });

    await assert.rejects(handleActionClick(PROFILE_TAB), TypeError);
    assert.match(logText(), /error: TypeError/);
  });

  test('a red ClubMail failure on a conversation logs its reason', async () => {
    extracted.fetchClubMailImages = { failed: true, reason: 'not your conversation' };

    await handleActionClick(CONVERSATION_TAB);

    assert.match(logText(), /path: conversation/);
    assert.match(logText(), /clubmail: failed {2}reason=not your conversation/);
    assert.match(logText(), /error: ClubMailApiError {2}reason=ClubMail unavailable \(not your conversation\)/);
  });

  test('a failed ZIP build is logged before the error', async () => {
    zipResponse = { error: 'no photo loaded' };

    await handleActionClick(PROFILE_TAB);

    assert.match(logText(), /zip: build failed {2}reason=no ZIP in the answer\n.*error: DownloadFailedError/);
  });

  test('the offscreen fetch failures land in the log of a failed build', async () => {
    zipResponse = {
      url: null, added: 0, missing: ['a'], logLines: [{ ms: 7, step: 'photo: missing', status: 404, url: 'https://img.example/a.jpg' }],
    };

    await handleActionClick(PROFILE_TAB);

    assert.match(logText(), /\+7 ms {2}photo: missing {2}status=404 {2}url=https:\/\/img\.example\/a\.jpg\n.*zip: build failed/s);
  });

  test('build-zip carries the click log and the ClubMail warning', async () => {
    extracted.fetchClubMailImages = { failed: true, reason: 'HTTP 500' };

    await handleActionClick(PROFILE_TAB);

    const build = callsNamed('sendMessage').find(({ action }) => action === 'build-zip');
    assert.equal(build.warning, true);
    assert.equal(typeof build.log.startedAt, 'number');
    assert.deepEqual(build.log.lines.map(({ step }) => step), ['path: profile', 'fsk18: status unknown', 'albums: 2 photo sources', 'videos: 0 of 0 with source', 'clubmail: failed', 'files: 2 of 2 new']);
  });

  test('build-zip carries no warning when ClubMail was read', async () => {
    await handleActionClick(PROFILE_TAB);

    assert.equal(callsNamed('sendMessage').find(({ action }) => action === 'build-zip').warning, false);
  });

  test('a failed ZIP download is logged after the build', async () => {
    download = async ({ filename }) => {
      if (filename !== LOG_FILENAME) {
        throw new Error('Invalid filename');
      }
      return DOWNLOAD_ID;
    };

    await handleActionClick(PROFILE_TAB);

    assert.match(logText(), /zip: 2 added, 0 missing\n.*error: DownloadFailedError/);
  });

  test('an unexpected exception logs only its name, not its message', async () => {
    extracted.fetchProfileAlbums = albumRaw({ list: { __typename: 'ProfileAlbumListByUserIdSuccess', regularAlbumResultList: 1 } });

    await assert.rejects(handleActionClick(PROFILE_TAB), TypeError);
    assert.doesNotMatch(logText(), /error: TypeError {2}reason/);
  });

  test('an unexpected exception still propagates when the log download fails', async () => {
    extracted.fetchProfileAlbums = albumRaw({ list: { __typename: 'ProfileAlbumListByUserIdSuccess', regularAlbumResultList: 1 } });
    download = async () => {
      throw new Error('Invalid filename');
    };

    await assert.rejects(handleActionClick(PROFILE_TAB), TypeError);
  });

  test('a failing log download keeps the red badge and its reason', async () => {
    executeScript = async () => [{ result: null }];
    download = async () => {
      throw new Error('Invalid filename');
    };

    assert.equal(await handleActionClick(TAB), null);
    assert.match(lastTitle(), /no lightbox image or profile photos found/);
    assert.equal(callsNamed('setBadgeBackgroundColor').at(-1).color, '#d00000');
  });

  test('a clean lightbox click downloads no log', async () => {
    await handleActionClick(TAB);

    assert.equal(logDownloads().length, 0);
  });

  test('a clean profile click downloads no log', async () => {
    await handleActionClick(PROFILE_TAB);

    assert.equal(contentDownloads().length, 1);
    assert.equal(logDownloads().length, 0);
  });
});

describe('"Save hidden image" context menu', () => {
  test('creates the menu on install for JoyClub pages only, in every context', () => {
    installedListeners.forEach((listener) => listener());

    assert.deepEqual(createdMenus.find(({ id }) => id === 'save-hidden-image'), {
      id: 'save-hidden-image',
      title: 'Save hidden image',
      contexts: ['page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio'],
      documentUrlPatterns: ['https://www.joyclub.de/*', 'https://www.joyclub.com/*'],
    });
    assert.deepEqual(menuListeners, [handleMenuClick]);
    assert.equal(globalThis.handleMenuClick, handleMenuClick);
  });

  test('asks the clicked frame for the image and downloads its jpg', async () => {
    const result = await handleMenuClick({ ...MENU_INFO, frameId: 3 }, MENU_TAB);

    assert.deepEqual(callsNamed('tabs.sendMessage'), [
      { tabId: MENU_TAB.id, message: { action: 'describe-hidden-image' }, options: { frameId: 3 } },
    ]);
    assert.deepEqual(result, { url: JPG_URL, filename: 'TestOwner_1001.jpg', downloadId: DOWNLOAD_ID });
    assert.equal(callsNamed('executeScript').length, 0);
    assert.equal(logDownloads().length, 0);
  });

  test('falls back to the webp when the jpg probe fails', async () => {
    fetchImpl = async () => ({ ok: false, status: HTTP_NOT_FOUND });

    const result = await handleMenuClick(MENU_INFO, MENU_TAB);

    assert.equal(result.url, IMAGE_URL);
    assert.equal(result.filename, 'TestOwner_1001.webp');
  });

  test('no image below the pointer shows "image address not found" and saves the log', async () => {
    tabMessage = async () => ({ ...HIDDEN_IMAGE, layers: [HIDDEN_IMAGE.layers[0]] });

    assert.equal(await handleMenuClick(MENU_INFO, MENU_TAB), null);
    assert.equal(lastBadgeText(), '!');
    assert.match(lastTitle(), /image address not found/);
    assert.equal(contentDownloads().length, 0);
    assert.match(logText(), /path: context menu {2}url=https:\/\/www\.joyclub\.de\/my_joy\/feed\/friends\/\n/);
    assert.match(logText(), /error: NoImageUrlError {2}reason=image address not found/);
  });

  test('a tab without the content script shows "reload the page and try again"', async () => {
    tabMessage = async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };

    assert.equal(await handleMenuClick(MENU_INFO, MENU_TAB), null);
    assert.match(lastTitle(), /reload the page and try again/);
    assert.equal(logDownloads().length, 1);
  });

  test('ignores other menu items', async () => {
    assert.equal(await handleMenuClick({ ...MENU_INFO, menuItemId: 'other' }, MENU_TAB), null);
    assert.deepEqual(calls, []);
  });
});

describe('incremental export', () => {
  const SAVED_KEY = `saved:${PROFILE_USER_ID}`;
  const BOTH_PHOTOS = ['00000001', '00000002'];
  const NEUTRAL_COLOR = '#5f6368';
  const FULL_MENU_INFO = { menuItemId: 'download-everything-again' };
  const settle = () => new Promise(setImmediate);
  const buildRequests = () => callsNamed('sendMessage').filter(({ action }) => action === 'build-zip');
  const saved = () => localStorageArea.items()[SAVED_KEY];

  async function clickAndFinish(tab = PROFILE_TAB, state = 'complete') {
    const result = await handleActionClick(tab);
    fireDownloadChanged(result.downloadId, state);
    await settle();
    return result;
  }

  afterEach(async () => {
    zipDownloadIds.forEach((id) => fireDownloadChanged(id, 'complete'));
    await settle();
  });

  test('the first click zips every photo and keeps their keys pending until the download ends', async () => {
    const result = await handleActionClick(PROFILE_TAB);

    assert.equal(buildRequests()[0].entries.length, 2);
    assert.deepEqual(sessionStorageArea.items(), {
      [`pending:${result.downloadId}`]: { userId: PROFILE_USER_ID, record: { photos: BOTH_PHOTOS, attachments: [] } },
    });
    assert.equal(saved(), undefined);
  });

  test('a complete download moves the pending keys into the saved record', async () => {
    await clickAndFinish();

    assert.deepEqual(saved(), { photos: BOTH_PHOTOS, attachments: [] });
    assert.deepEqual(sessionStorageArea.items(), {});
  });

  test('a second click without changes saves nothing and shows the neutral "nothing new" badge', async () => {
    await clickAndFinish();
    calls = [];

    const result = await handleActionClick(PROFILE_TAB);

    assert.deepEqual(result, { nothingNew: true });
    assert.equal(buildRequests().length, 0);
    assert.equal(callsNamed('download').length, 0);
    assert.equal(lastBadgeText(), '✓');
    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: NEUTRAL_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: nothing new');
  });

  test('an interrupted download is not recorded, so the next click zips the photos again', async () => {
    await clickAndFinish(PROFILE_TAB, 'interrupted');

    assert.equal(saved(), undefined);
    assert.deepEqual(sessionStorageArea.items(), {});
    await handleActionClick(PROFILE_TAB);
    assert.equal(buildRequests().at(-1).entries.length, 2);
  });

  test('a new photo is zipped alone under its full-ZIP name, with complete reports', async () => {
    localStorageArea.items()[SAVED_KEY] = { photos: ['00000001'], attachments: [] };

    await handleActionClick(PROFILE_TAB);

    const build = buildRequests()[0];
    assert.deepEqual(build.entries.map(({ name }) => name), ['Aktuelles/TestOwner_Aktuelles_01_00000002.jpg']);
    assert.deepEqual(build.reports.filter(({ name }) => name === 'skipped.txt'), [{ name: 'skipped.txt', text: 'Lady (9 photos): NEEDS_PERMISSION_BY_OWNER\n' }]);
  });

  test('a completed download adds its keys to the saved record', async () => {
    localStorageArea.items()[SAVED_KEY] = { photos: ['00000001'], attachments: ['a0'], lastMessageId: '5' };

    await clickAndFinish();

    assert.deepEqual(saved(), { photos: BOTH_PHOTOS, attachments: ['a0'], lastMessageId: '5' });
  });

  test('missing photos are not recorded', async () => {
    zipResponse = { url: BLOB_URL, added: 1, missing: [`${IMAGE_BASE}/${testUuid(2)}/orig/image_1920_k.jpg?cache=c`] };

    await clickAndFinish();

    assert.deepEqual(saved(), { photos: ['00000001'], attachments: [] });
  });

  test('videos are built in the ZIP and recorded, an unsupported one too, so it is not retried', async () => {
    extracted.fetchProfileVideos = { videos: [VIDEO_ID_1, VIDEO_ID_2].map((id) => ({ id, source: masterUrlOf(id), query: SIGNED_QUERY })) };
    zipResponse = { url: BLOB_URL, added: 3, missing: [], unsupported: [masterUrlOf(VIDEO_ID_2)] };

    await clickAndFinish();

    const videoEntries = buildRequests()[0].entries.filter(({ videoId }) => videoId);
    assert.deepEqual(videoEntries.map(({ videoId, hls }) => [videoId, hls.query]), [[VIDEO_ID_1, SIGNED_QUERY], [VIDEO_ID_2, SIGNED_QUERY]]);
    assert.deepEqual(saved(), { photos: BOTH_PHOTOS, attachments: [], videos: [VIDEO_ID_1, VIDEO_ID_2] });
  });

  test('a saved video is not zipped again', async () => {
    extracted.fetchProfileVideos = { videos: [{ id: VIDEO_ID_1, source: masterUrlOf(VIDEO_ID_1), query: SIGNED_QUERY }] };
    localStorageArea.items()[SAVED_KEY] = { photos: BOTH_PHOTOS, attachments: [], videos: [VIDEO_ID_1] };

    assert.deepEqual(await handleActionClick(PROFILE_TAB), { nothingNew: true });
  });

  test('a new message without attachment zips the transcripts only', async () => {
    extracted.fetchClubMailImages = { origin: ORIGIN, partnerId: PARTNER.id, messages: [attachmentMessage('11', 'a1'), textMessage('12')] };
    localStorageArea.items()[SAVED_KEY] = { photos: BOTH_PHOTOS, attachments: ['a1'], lastMessageId: '11' };

    await clickAndFinish();

    const build = buildRequests()[0];
    assert.deepEqual(build.entries, []);
    assert.deepEqual(build.reports.map(({ name }) => name), ['skipped.txt', 'ClubMail/conversation.md', 'ClubMail/conversation.html', 'profile.md', 'profile.html']);
    assert.equal(saved().lastMessageId, '12');
  });

  test('"Download everything again" zips every photo and keeps the record', async () => {
    await clickAndFinish();
    calls = [];

    const result = await handleMenuClick(FULL_MENU_INFO, PROFILE_TAB);
    fireDownloadChanged(result.downloadId, 'complete');
    await settle();

    assert.equal(buildRequests()[0].entries.length, 2);
    assert.deepEqual(saved(), { photos: BOTH_PHOTOS, attachments: [] });
  });

  test('a changed profile text alone zips the profile files, and an unchanged one is nothing new', async () => {
    extracted.fetchProfileAlbums = albumRaw({ profileText: profileTextResult({ description: 'Hallo' }) });
    await clickAndFinish();
    const firstHash = saved().profileTextHash;
    assert.match(firstHash, /^[0-9a-f]{8}$/);
    assert.deepEqual(await handleActionClick(PROFILE_TAB), { nothingNew: true });
    calls = [];
    extracted.fetchProfileAlbums = albumRaw({ profileText: profileTextResult({ description: 'Hallo, neu' }) });

    await clickAndFinish();

    const build = buildRequests()[0];
    assert.deepEqual(build.entries, []);
    assert.deepEqual(build.reports.map(({ name }) => name), ['skipped.txt', 'profile.md', 'profile.html']);
    assert.notEqual(saved().profileTextHash, firstHash);
  });

  test('a conversation records the attachments and the newest message under the partner id', async () => {
    extracted.fetchClubMailImages = { origin: ORIGIN, partnerId: PARTNER.id, messages: [attachmentMessage('11', 'a1'), textMessage('12', { from: ME })] };

    await clickAndFinish(CONVERSATION_TAB);

    assert.deepEqual(localStorageArea.items()[`saved:${PARTNER.id}`], { photos: [], attachments: ['a1'], lastMessageId: '12' });
    assert.deepEqual(await handleActionClick(CONVERSATION_TAB), { nothingNew: true });
  });

  test('a pending record from before a service worker restart is merged when its download completes', async () => {
    const earlierId = 77;
    sessionStorageArea.items()[`pending:${earlierId}`] = { userId: PROFILE_USER_ID, record: { photos: ['00000001'], attachments: [] } };

    fireDownloadChanged(earlierId, 'complete');
    await settle();

    assert.deepEqual(saved(), { photos: ['00000001'], attachments: [] });
  });

  test('nothing new while ClubMail failed shows the amber warning and saves the log', async () => {
    localStorageArea.items()[SAVED_KEY] = { photos: BOTH_PHOTOS, attachments: [] };
    extracted.fetchClubMailImages = { failed: true, reason: 'HTTP 500' };

    assert.deepEqual(await handleActionClick(PROFILE_TAB), { nothingNew: true });

    assert.equal(contentDownloads().length, 0);
    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: WARNING_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: nothing new; ClubMail unavailable (HTTP 500)');
    assert.match(logText(), /files: 0 of 2 new\n.*nothing new\n/s);
  });

  test('nothing new while the video list failed shows the amber warning and saves the log', async () => {
    localStorageArea.items()[SAVED_KEY] = { photos: BOTH_PHOTOS, attachments: [] };
    extracted.fetchProfileVideos = { failed: true, reason: 'timeout' };

    assert.deepEqual(await handleActionClick(PROFILE_TAB), { nothingNew: true });

    assert.deepEqual(callsNamed('setBadgeBackgroundColor').at(-1), { tabId: PROFILE_TAB.id, color: WARNING_COLOR });
    assert.equal(lastTitle(), 'Hidden Image Downloader: nothing new; videos unavailable (timeout)');
    assert.match(logText(), /videos: failed {2}reason=timeout\n/);
  });

  test('two downloads of one user finishing together both land in the record', async () => {
    extracted.fetchClubMailImages = { origin: ORIGIN, partnerId: PARTNER.id, messages: [attachmentMessage('11', 'a1')] };
    const first = await handleActionClick(PROFILE_TAB);
    extracted.fetchClubMailImages = { origin: ORIGIN, partnerId: PARTNER.id, messages: [attachmentMessage('11', 'a1'), attachmentMessage('12', 'a2')] };
    const second = await handleActionClick(PROFILE_TAB);

    fireDownloadChanged(first.downloadId, 'complete');
    fireDownloadChanged(second.downloadId, 'complete');
    await settle();

    assert.deepEqual(saved(), { photos: BOTH_PHOTOS, attachments: ['a1', 'a2'], lastMessageId: '12' });
  });

  test('a failing pending write keeps the ZIP download and leaves the record alone', async () => {
    mock.method(sessionStorageArea, 'set', async () => {
      throw new Error('quota');
    });

    const result = await handleActionClick(PROFILE_TAB);

    assert.equal(result.downloadId, ZIP_DOWNLOAD_ID);
    assert.equal(lastBadgeText(), '');
    assert.equal(logDownloads().length, 0);
  });

  test('creates the "Download everything again" menu on the toolbar icon', () => {
    installedListeners.forEach((listener) => listener());

    assert.deepEqual(createdMenus.find(({ id }) => id === 'download-everything-again'), {
      id: 'download-everything-again', title: 'Download everything again', contexts: ['action'],
    });
  });
});

describe('FSK18 unlock', () => {
  const LOCKED_PAGE = { action: 'fsk18-status', status: '0' };
  const UNLOCKED_PAGE = { action: 'fsk18-status', status: '1' };
  const OTHER_TAB_ID = 9;
  const FLUSH_ROUNDS = 20;
  const flush = async () => {
    for (let round = 0; round < FLUSH_ROUNDS; round++) {
      await new Promise(setImmediate);
    }
  };
  const storePassword = () => localStorageArea.set({ fsk18Password: PASSWORD });
  const firePageLocked = (sender) => messageListeners.forEach((listener) => listener(LOCKED_PAGE, sender));
  const firePageUnlocked = (sender) => messageListeners.forEach((listener) => listener(UNLOCKED_PAGE, sender));
  // Everything but the prompt's own injection: badges, downloads (the log), messages, storage writes.
  const everythingSent = () => JSON.stringify([calls.filter(([name]) => name !== 'submitPassword'), sessionStorageArea.items()]);

  afterEach(async () => {
    mock.timers.reset();
    // The reloaded pages come back unlocked.
    [MENU_TAB.id, OTHER_TAB_ID, PROFILE_TAB.id].forEach((id) => firePageUnlocked({ tab: { ...MENU_TAB, id }, frameId: 0 }));
    zipDownloadIds.forEach((id) => fireDownloadChanged(id, 'complete'));
    await flush();
  });

  test('an unlocked session downloads at once, without a prompt tab', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '1');
    await storePassword();

    await handleActionClick(PROFILE_TAB);

    assert.equal(callsNamed('tabs.create').length, 0);
    assert.equal(contentDownloads()[0].url, BLOB_URL);
  });

  test('a locked session types the stored password into a background prompt, then loads the albums', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    await storePassword();

    await handleActionClick(PROFILE_TAB);

    assert.deepEqual(callsNamed('tabs.create'), [{ url: 'https://www.joyclub.de/login/agecheck.html', active: false }]);
    assert.deepEqual(callsNamed('submitPassword').map(({ target, args }) => [target.tabId, args]), [[UNLOCK_TAB_ID, [PASSWORD]]]);
    assert.deepEqual(callsNamed('tabs.remove'), [UNLOCK_TAB_ID]);
    const order = calls.map(([name]) => name);
    assert.ok(order.indexOf('tabs.remove') < order.indexOf('executeScript'));
    assert.equal(contentDownloads()[0].url, BLOB_URL);
    const build = callsNamed('sendMessage').find(({ action }) => action === 'build-zip');
    assert.deepEqual(build.log.lines.map(({ step }) => step).slice(0, 4), ['path: profile', 'fsk18: status 0', 'fsk18: unlocking', 'fsk18: unlocked']);
    assert.equal(JSON.stringify(build).includes(PASSWORD), false);
  });

  test('without a stored password the prompt opens in front for the user', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    // The user types the password while the extension waits.
    let checks = 0;
    mock.method(chrome.tabs, 'get', async () => {
      checks++;
      if (checks > 1) {
        fsk18Statuses.set(UNLOCK_TAB_ID, '1');
        return { ...unlockTab, url: UNLOCKED_URL };
      }
      return unlockTab;
    });
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });

    const click = handleActionClick(PROFILE_TAB);
    await flush();
    mock.timers.tick(UNLOCK_POLL_MS);
    await click;

    assert.deepEqual(callsNamed('tabs.create'), [{ url: 'https://www.joyclub.de/login/agecheck.html', active: true }]);
    assert.equal(callsNamed('submitPassword').length, 0);
    assert.equal(contentDownloads()[0].url, BLOB_URL);
  });

  test('a wrong password is tried once, then a red badge and a log without the password; no album is loaded', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    await localStorageArea.set({ fsk18Password: 'wrong-password' });
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });

    let result = 'pending';
    const click = handleActionClick(PROFILE_TAB).then((value) => {
      result = value;
    });
    for (let waited = 0; result === 'pending' && waited <= UNLOCK_STEP_TIMEOUT_MS; waited += UNLOCK_POLL_MS) {
      await flush();
      mock.timers.tick(UNLOCK_POLL_MS);
    }
    await click;

    assert.equal(result, null);
    assert.equal(callsNamed('submitPassword').length, 1);
    assert.equal(callsNamed('executeScript').length, 0);
    assert.equal(contentDownloads().length, 0);
    assert.equal(lastBadgeText(), '!');
    assert.equal(lastTitle(), 'Hidden Image Downloader: 18+ unlock failed (password not accepted)');
    assert.deepEqual(callsNamed('tabs.remove'), [UNLOCK_TAB_ID]);
    assert.match(logText(), /error: Fsk18UnlockError/);
    assert.equal(everythingSent().includes('wrong-password'), false);
    assert.deepEqual(sessionStorageArea.items(), { fsk18UnlockFailed: true });
  });

  test('a closed prompt fails the click', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    await storePassword();
    unlockTab = null;

    assert.equal(await handleActionClick(PROFILE_TAB), null);

    assert.equal(lastTitle(), 'Hidden Image Downloader: 18+ unlock failed (prompt closed)');
    assert.equal(callsNamed('submitPassword').length, 0);
  });

  test('a prompt without password field fails without retry', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    await storePassword();
    submitPassword = async () => [{ result: false }];

    assert.equal(await handleActionClick(PROFILE_TAB), null);

    assert.equal(lastTitle(), 'Hidden Image Downloader: 18+ unlock failed (no password field)');
    assert.equal(callsNamed('submitPassword').length, 1);
  });

  test('a locked page with a stored password is unlocked and reloaded', async () => {
    await storePassword();

    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await flush();

    assert.equal(callsNamed('tabs.create')[0].active, false);
    assert.deepEqual(callsNamed('tabs.reload'), [MENU_TAB.id]);
  });

  test('two locked pages share one unlock and are both reloaded', async () => {
    await storePassword();

    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    firePageLocked({ tab: { ...MENU_TAB, id: OTHER_TAB_ID }, frameId: 0 });
    await flush();

    assert.equal(callsNamed('tabs.create').length, 1);
    assert.deepEqual(callsNamed('tabs.reload').sort(), [MENU_TAB.id, OTHER_TAB_ID]);
  });

  test('a locked page does nothing without a password, from a subframe, or after a failed unlock', async () => {
    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await storePassword();
    firePageLocked({ tab: MENU_TAB, frameId: 3 });
    await sessionStorageArea.set({ fsk18UnlockFailed: true });
    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await flush();

    assert.equal(callsNamed('tabs.create').length, 0);
    assert.equal(callsNamed('tabs.reload').length, 0);
  });

  test('a failed unlock of a locked page shows the red badge and does not reload', async () => {
    await storePassword();
    submitPassword = async () => [{ result: false }];

    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await flush();

    assert.equal(lastTitle(), 'Hidden Image Downloader: 18+ unlock failed (no password field)');
    assert.equal(callsNamed('tabs.reload').length, 0);
    assert.equal(logDownloads().length, 0);
    assert.equal(everythingSent().includes(PASSWORD), false);
  });

  test('a session unlocked elsewhere is taken as unlocked without typing the password', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    await storePassword();
    unlockTab = { ...unlockTab, url: UNLOCKED_URL };
    fsk18Statuses.set(UNLOCK_TAB_ID, '1');

    await handleActionClick(PROFILE_TAB);

    assert.equal(callsNamed('submitPassword').length, 0);
    assert.deepEqual(callsNamed('tabs.remove'), [UNLOCK_TAB_ID]);
    assert.equal(contentDownloads()[0].url, BLOB_URL);
  });

  test('a reloaded page that reports locked again starts no second unlock, until it was unlocked once', async () => {
    await storePassword();

    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await flush();
    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await flush();

    assert.equal(callsNamed('tabs.create').length, 1);
    assert.deepEqual(callsNamed('tabs.reload'), [MENU_TAB.id]);

    firePageUnlocked({ tab: MENU_TAB, frameId: 0 });
    firePageLocked({ tab: MENU_TAB, frameId: 0 });
    await flush();

    assert.equal(callsNamed('tabs.create').length, 2);
  });

  test('a page-load unlock does not reload a tab a toolbar click reads from', async () => {
    fsk18Statuses.set(PROFILE_TAB.id, '0');
    await storePassword();

    firePageLocked({ tab: PROFILE_TAB, frameId: 0 });
    await handleActionClick(PROFILE_TAB);
    await flush();

    assert.equal(callsNamed('tabs.create').length, 1);
    assert.equal(callsNamed('tabs.reload').length, 0);
    assert.equal(contentDownloads()[0].url, BLOB_URL);
  });

  test('the context menu on a gated photo asks to unlock first instead of saving it pixelated', async () => {
    tabMessage = async () => ({
      ...HIDDEN_IMAGE,
      layers: [{ ...HIDDEN_IMAGE.layers[1], gated: true }],
    });

    assert.equal(await handleMenuClick(MENU_INFO, MENU_TAB), null);

    assert.equal(lastTitle(), 'Hidden Image Downloader: unlock 18+ first');
    assert.equal(contentDownloads().length, 0);
  });
});
