import { PASSWORD_KEY, UNLOCK_FAILED_KEY } from './lib/fsk18.js';

const STORED_TEXT = 'A password is stored.';
const NONE_TEXT = 'No password stored: a locked session opens JoyClub\'s prompt for you to type it.';

const form = document.getElementById('password-form');
const field = document.getElementById('password');
const status = document.getElementById('status');

async function showStatus() {
  const { [PASSWORD_KEY]: password } = await chrome.storage.local.get(PASSWORD_KEY);
  status.textContent = password ? STORED_TEXT : NONE_TEXT;
}

// A new password may unlock again after a failed attempt.
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({ [PASSWORD_KEY]: field.value });
  await chrome.storage.session.remove(UNLOCK_FAILED_KEY);
  field.value = '';
  await showStatus();
});

document.getElementById('forget').addEventListener('click', async () => {
  await chrome.storage.local.remove(PASSWORD_KEY);
  field.value = '';
  await showStatus();
});

showStatus();
