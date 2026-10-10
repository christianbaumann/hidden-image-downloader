import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('manifest is Manifest V3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('manifest version matches package.json', () => {
  assert.equal(manifest.version, pkg.version);
});

test('manifest registers background.js as module service worker', () => {
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.ok(existsSync(resolve(root, manifest.background.service_worker)));
});

test('manifest requests only scripting, downloads, offscreen, contextMenus and storage permissions', () => {
  assert.deepEqual(manifest.permissions, ['scripting', 'downloads', 'offscreen', 'contextMenus', 'storage']);
});

test('manifest runs content.js in every JoyClub frame only', () => {
  assert.deepEqual(manifest.content_scripts, [
    { matches: ['https://www.joyclub.de/*', 'https://www.joyclub.com/*'], js: ['content.js'], run_at: 'document_start', all_frames: true },
  ]);
  assert.ok(existsSync(resolve(root, 'content.js')));
});

test('offscreen document exists', () => {
  assert.ok(existsSync(resolve(root, 'offscreen.html')));
});

test('manifest grants host access to JoyClub, its image host and its video host', () => {
  assert.deepEqual(manifest.host_permissions, [
    'https://www.joyclub.de/*',
    'https://www.joyclub.com/*',
    'https://image-user.feig-partner.de/*',
    'https://uservideo.joyclub.de/*',
  ]);
});

test('manifest action has a title and no popup', () => {
  assert.equal(manifest.action.default_title, 'Download hidden image');
  assert.equal(manifest.action.default_popup, undefined);
});

test('manifest icons exist at 16, 48 and 128 px', () => {
  assert.deepEqual(Object.keys(manifest.icons), ['16', '48', '128']);
  for (const [size, path] of Object.entries(manifest.icons)) {
    assert.equal(path, `icons/icon${size}.png`);
    assert.ok(existsSync(resolve(root, path)));
  }
});
