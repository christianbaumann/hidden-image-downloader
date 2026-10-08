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

test('manifest requests only scripting and downloads permissions', () => {
  assert.deepEqual(manifest.permissions, ['scripting', 'downloads']);
});

test('manifest grants host access to JoyClub only', () => {
  assert.deepEqual(manifest.host_permissions, ['https://www.joyclub.de/*', 'https://www.joyclub.com/*']);
});

test('manifest action has a title and no popup', () => {
  assert.equal(manifest.action.default_title, 'Download hidden image');
  assert.equal(manifest.action.default_popup, undefined);
});
