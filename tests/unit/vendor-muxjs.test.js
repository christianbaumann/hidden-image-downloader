import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const VENDORED = join(__dir, '../../vendor/mux.min.js');
const PINNED_DIST = join(__dir, '../../node_modules/mux.js/dist/mux.min.js');
const PINNED_PACKAGE_JSON = join(__dir, '../../node_modules/mux.js/package.json');
const PROVENANCE_LINE_COUNT = 2;

const vendored = readFileSync(VENDORED, 'utf8');
const pinnedVersion = JSON.parse(readFileSync(PINNED_PACKAGE_JSON, 'utf8')).version;

describe('vendor/mux.min.js provenance', () => {
  it('header states the vendored version', () => {
    assert.ok(vendored.includes(`mux.js ${pinnedVersion}`), `header must name the pinned version ${pinnedVersion}`);
  });

  it('header states the re-vendor command', () => {
    assert.match(vendored, /cp node_modules\/mux\.js\/dist\/mux\.min\.js vendor\/mux\.min\.js/);
  });

  it('body is byte-identical to the pinned npm dist', () => {
    const body = vendored.split('\n').slice(PROVENANCE_LINE_COUNT).join('\n');
    assert.equal(body, readFileSync(PINNED_DIST, 'utf8'));
  });
});
