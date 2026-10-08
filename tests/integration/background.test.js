import { beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

const TAB = { id: 7 };
const OTHER_TAB = { id: 8 };
const IMAGE_URL = 'https://cdn.joyclub.de/img/abc_1920.webp?c=1';
const DOWNLOAD_ID = 42;
const VALID_DATA = {
  style: `background-image: url("${IMAGE_URL}")`,
  title: 'Rück: Ansicht',
  owner: 'TestOwner',
  photoId: '1001',
  pageUrl: 'https://www.joyclub.de/profile/1.html',
};

const listeners = [];
let calls;
let executeScript;
let download;

const record = (name) => async (details) => {
  calls.push([name, details]);
};

globalThis.chrome = {
  action: {
    onClicked: { addListener: (listener) => listeners.push(listener) },
    setBadgeText: record('setBadgeText'),
    setBadgeBackgroundColor: record('setBadgeBackgroundColor'),
    setTitle: record('setTitle'),
  },
  scripting: {
    executeScript: async (options) => {
      calls.push(['executeScript', options]);
      return executeScript(options);
    },
  },
  downloads: {
    download: async (options) => {
      calls.push(['download', options]);
      return download(options);
    },
  },
};

const { handleActionClick } = await import('../../background.js');

const callsNamed = (name) => calls.filter(([callName]) => callName === name).map(([, details]) => details);
const lastTitle = () => callsNamed('setTitle').at(-1).title;
const lastBadgeText = () => callsNamed('setBadgeText').at(-1).text;

beforeEach(() => {
  mock.restoreAll();
  calls = [];
  executeScript = async () => [{ result: VALID_DATA }];
  download = async () => DOWNLOAD_ID;
  mock.method(console, 'warn', () => {});
});

describe('background registration', () => {
  test('registers one onClicked listener and exposes handleActionClick', () => {
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0], handleActionClick);
    assert.equal(globalThis.handleActionClick, handleActionClick);
  });
});

describe('handleActionClick', () => {
  test('downloads the active image with a sanitised filename', async () => {
    const result = await handleActionClick(TAB);

    const [options] = callsNamed('download');
    assert.equal(options.url, IMAGE_URL);
    assert.match(options.filename, /^TestOwner_Rück_-Ansicht_\d{4}-\d{2}-\d{2}_\d{6}\.webp$/);
    assert.equal(options.conflictAction, 'uniquify');
    assert.equal(options.saveAs, false);
    assert.deepEqual(result, { url: IMAGE_URL, filename: options.filename, downloadId: DOWNLOAD_ID });
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
    assert.equal(callsNamed('download').length, 0);
  });

  test('no lightbox shows "no image open in the lightbox"', async () => {
    executeScript = async () => [{ result: null }];

    assert.equal(await handleActionClick(TAB), null);
    assert.equal(lastBadgeText(), '!');
    assert.match(lastTitle(), /no image open in the lightbox/);
    assert.equal(callsNamed('download').length, 0);
  });

  test('missing image URL shows "image address not found"', async () => {
    executeScript = async () => [{ result: { ...VALID_DATA, style: 'opacity: 1' } }];

    assert.equal(await handleActionClick(TAB), null);
    assert.match(lastTitle(), /image address not found/);
    assert.equal(callsNamed('download').length, 0);
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
