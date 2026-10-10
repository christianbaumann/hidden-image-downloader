export const PASSWORD_KEY = 'fsk18Password';
// storage.session: set after a failed unlock, so page loads never retry a wrong password (JoyClub rate-limits it).
export const UNLOCK_FAILED_KEY = 'fsk18UnlockFailed';
export const LOCKED_STATUS = '0';
export const UNLOCKED_STATUS = '1';
const AGECHECK_PATH = '/login/agecheck.html';
const DEFAULT_ORIGIN = 'https://www.joyclub.de';
const PROMPT_HOST = 'identity.joyclub.com';
const PROMPT_PATH = /^\/ui\/fsk18(?:\/|$)/;
const JOYCLUB_HOSTS = new Set(['www.joyclub.de', 'www.joyclub.com']);
const TAB_COMPLETE = 'complete';

export class Fsk18UnlockError extends Error {
  name = 'Fsk18UnlockError';

  constructor(reason) {
    super();
    this.reason = reason;
  }
}

// A menu click on a photo behind the FSK18 gate: its page serves only the pixelated variant.
export class Fsk18LockedError extends Error {
  name = 'Fsk18LockedError';
}

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// The unlock prompt on the tab's JoyClub domain, else on www.joyclub.de.
export function agecheckUrl(tabUrl) {
  const url = parse(tabUrl);
  const origin = url && JOYCLUB_HOSTS.has(url.hostname) ? url.origin : DEFAULT_ORIGIN;
  return origin + AGECHECK_PATH;
}

const isLoaded = (tab) => tab?.status === TAB_COMPLETE;

// The tab shows JoyClub's password prompt (identity.joyclub.com/ui/fsk18/…).
export function isPromptTab(tab) {
  const url = parse(tab?.url);
  return isLoaded(tab) && url?.hostname === PROMPT_HOST && PROMPT_PATH.test(url.pathname);
}

// The tab is back on JoyClub after the prompt (any page: JoyClub picks the page it returns to).
export function isJoyclubTab(tab) {
  return isLoaded(tab) && JOYCLUB_HOSTS.has(parse(tab?.url)?.hostname);
}

// Injected via chrome.scripting.executeScript: must stay self-contained.
export function readFsk18Status() {
  return document.body?.dataset.sessionFsk18Status ?? null;
}

// Injected into the prompt: must stay self-contained. Fills the Vue password field and submits once.
// Answers whether it found the field; the password never leaves the page.
export async function submitFsk18Password(password) {
  const FIELD = 'input[type="password"][autocomplete="current-password"]';
  const SUBMIT = 'j-button.submit-btn';
  const WAIT_LIMIT = 50;
  const WAIT_DELAY_MS = 100;
  const pause = () => new Promise((resolve) => setTimeout(resolve, WAIT_DELAY_MS));
  for (let attempt = 0; attempt < WAIT_LIMIT; attempt++) {
    const field = document.querySelector(FIELD);
    const submit = document.querySelector(SUBMIT);
    if (field && submit) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, password);
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
      await pause();
      submit.click();
      return true;
    }
    await pause();
  }
  return false;
}
