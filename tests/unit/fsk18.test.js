import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { agecheckUrl, isJoyclubTab, isPromptTab, readFsk18Status, submitFsk18Password } from '../../lib/fsk18.js';

const PROMPT_URL = 'https://identity.joyclub.com/ui/fsk18/challenge/password';
const loaded = (url) => ({ url, status: 'complete' });

describe('agecheckUrl', () => {
  test('opens the prompt on the tab\'s JoyClub domain', () => {
    assert.equal(agecheckUrl('https://www.joyclub.com/profile/1.x.html'), 'https://www.joyclub.com/login/agecheck.html');
  });

  test('falls back to www.joyclub.de for other or missing URLs', () => {
    assert.equal(agecheckUrl('https://example.com/'), 'https://www.joyclub.de/login/agecheck.html');
    assert.equal(agecheckUrl(undefined), 'https://www.joyclub.de/login/agecheck.html');
  });
});

describe('isPromptTab', () => {
  test('matches the loaded FSK18 prompt', () => {
    assert.equal(isPromptTab(loaded(PROMPT_URL)), true);
    assert.equal(isPromptTab(loaded('https://identity.joyclub.com/ui/fsk18?x=1')), true);
  });

  test('does not match while loading, other identity pages or JoyClub', () => {
    assert.equal(isPromptTab({ url: PROMPT_URL, status: 'loading' }), false);
    assert.equal(isPromptTab(loaded('https://identity.joyclub.com/ui/redirect')), false);
    assert.equal(isPromptTab(loaded('https://www.joyclub.de/ui/fsk18')), false);
  });
});

describe('isJoyclubTab', () => {
  test('matches a loaded JoyClub page', () => {
    assert.equal(isJoyclubTab(loaded('https://www.joyclub.de/my_joy/feed/friends/')), true);
    assert.equal(isJoyclubTab(loaded('https://www.joyclub.com/')), true);
  });

  test('does not match the prompt, a loading page or a missing URL', () => {
    assert.equal(isJoyclubTab(loaded(PROMPT_URL)), false);
    assert.equal(isJoyclubTab({ url: 'https://www.joyclub.de/', status: 'loading' }), false);
    assert.equal(isJoyclubTab({ status: 'complete' }), false);
  });
});

// Minimal DOM for the injected functions.
function fakeDocument({ status, field, submit } = {}) {
  return {
    body: { dataset: status === undefined ? {} : { sessionFsk18Status: status } },
    querySelector: (selector) => (selector.startsWith('input') ? field : selector.startsWith('j-button') && submit) ?? null,
  };
}

describe('injected functions', () => {
  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
  });

  test('readFsk18Status reads the body attribute, null without one', () => {
    globalThis.document = fakeDocument({ status: '0' });
    assert.equal(readFsk18Status(), '0');
    globalThis.document = fakeDocument();
    assert.equal(readFsk18Status(), null);
  });

  test('submitFsk18Password sets the value through the native setter, fires input, then submits once', async () => {
    const events = [];
    class FakeInput {
      dispatchEvent(event) {
        events.push(['event', event.type, event.bubbles, this.value]);
      }
    }
    Object.defineProperty(FakeInput.prototype, 'value', {
      set(value) {
        events.push(['set']);
        this.stored = value;
      },
      get() {
        return this.stored;
      },
    });
    const field = new FakeInput();
    const submit = { click: () => events.push(['click']) };
    globalThis.document = fakeDocument({ field, submit });
    globalThis.window = { HTMLInputElement: FakeInput, Event: class { constructor(type, { bubbles }) { Object.assign(this, { type, bubbles }); } } };

    assert.equal(await submitFsk18Password('secret'), true);
    assert.deepEqual(events, [['set'], ['event', 'input', true, 'secret'], ['click']]);
  });
});
