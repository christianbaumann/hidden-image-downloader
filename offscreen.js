import { buildZip } from './lib/zip.js';

// Messages: { target: 'offscreen', action: 'ping' } → { ready: true }
//           { target: 'offscreen', action: 'build-zip', entries, reports } → { url|null, added, missing } or { error }
// Other targets: no answer. The blob URL lives until the service worker closes this document.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') {
    return;
  }
  if (message.action === 'ping') {
    sendResponse({ ready: true });
    return true;
  }
  if (message.action === 'build-zip') {
    buildZip(message.entries, { JSZip, fetch: (...args) => fetch(...args), reports: message.reports ?? [] })
      .then(({ blob, added, missing }) => sendResponse({ url: blob ? URL.createObjectURL(blob) : null, added, missing }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});
