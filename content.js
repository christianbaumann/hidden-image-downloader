// Runs on JoyClub pages. Remembers the last right-click; the "Save hidden image" menu asks for the image layers below it.
// A content script is no ES module: DESCRIBE_ACTION is repeated in background.js.
const DESCRIBE_ACTION = 'describe-hidden-image';

let lastContextMenu = null;

document.addEventListener('contextmenu', (event) => {
  lastContextMenu = { x: event.clientX, y: event.clientY };
}, true);

function textOf(element) {
  return element?.textContent.trim() ?? '';
}

// An img's own srcset plus those of its <picture> sources.
function srcsetOf(element) {
  if (element.tagName !== 'IMG') {
    return '';
  }
  const picture = element.parentElement?.tagName === 'PICTURE' ? element.parentElement : null;
  const sources = picture ? [...picture.querySelectorAll('source')] : [];
  return [...sources, element].map((source) => source.srcset).filter(Boolean).join(', ');
}

function describeImageLayers() {
  if (!lastContextMenu) {
    return null;
  }
  const albumLinks = [...document.querySelectorAll('a.album-link')];
  return {
    pageUrl: location.href,
    owner: textOf(document.querySelector('h1.profile-base-info__user-name')),
    album: textOf(document.querySelector('h2.profile-headline')),
    albumLinks: albumLinks.map((link) => link.getAttribute('href')),
    layers: document.elementsFromPoint(lastContextMenu.x, lastContextMenu.y)
      .filter((element) => element !== document.body && element !== document.documentElement)
      .map((element) => {
        const style = window.getComputedStyle(element);
        return {
          backgroundImage: style.backgroundImage,
          backgroundColor: style.backgroundColor,
          srcset: srcsetOf(element),
          photoId: element.closest('[data-photo]')?.dataset.photo ?? null,
          linkIndex: albumLinks.indexOf(element.closest('a.album-link')),
          owner: textOf(element.closest('.lightbox_slide')?.querySelector('a.lb_owner_name')),
        };
      }),
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === DESCRIBE_ACTION) {
    sendResponse(describeImageLayers());
  }
});
