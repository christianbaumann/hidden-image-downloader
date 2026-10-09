import { buildZip } from './lib/zip.js';
import { throttleProgress } from './lib/progress.js';

function sendProgress(jobId) {
  return throttleProgress((done, total) => {
    chrome.runtime.sendMessage({ target: 'background', action: 'zip-progress', jobId, done, total })
      .catch(() => console.warn('progress message failed'));
  });
}

// Messages: { target: 'offscreen', action: 'ping' } → { ready: true }
//           { target: 'offscreen', action: 'build-zip', jobId, root, entries, reports } → { url|null, added, missing } or { error }
// Sends:    { target: 'background', action: 'zip-progress', jobId, done, total }, at most once per whole percent.
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
    buildZip(message.entries, {
      JSZip,
      fetch: (...args) => fetch(...args),
      reports: message.reports ?? [],
      root: message.root,
      onProgress: sendProgress(message.jobId),
    })
      .then(({ blob, added, missing }) => sendResponse({ url: blob ? URL.createObjectURL(blob) : null, added, missing }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});
