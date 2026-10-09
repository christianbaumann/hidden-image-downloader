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

function containsPoint(element, { x, y }) {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

// elementsFromPoint skips elements with pointer-events: none, such as the lightbox image below its overlay.
// Each hit element is preceded by its other descendants under the point, which paint above it.
function elementsUnder(point) {
  const hit = document.elementsFromPoint(point.x, point.y)
    .filter((element) => element !== document.body && element !== document.documentElement);
  const seen = new Set(hit);
  return hit.flatMap((element) => {
    const hidden = [...element.querySelectorAll('*')].filter((child) => !seen.has(child)
      && window.getComputedStyle(child).visibility !== 'hidden' && containsPoint(child, point));
    hidden.forEach((child) => seen.add(child));
    return [...hidden.reverse(), element];
  });
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
    layers: elementsUnder(lastContextMenu).map((element) => {
      const style = window.getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        srcset: srcsetOf(element),
        src: element.tagName === 'IMG' ? element.getAttribute('src') ?? '' : '',
        photoId: element.closest('[data-photo]')?.dataset.photo ?? null,
        linkIndex: albumLinks.indexOf(element.closest('a.album-link')),
        owner: textOf(element.closest('.lightbox_slide')?.querySelector('a.lb_owner_name')),
        userName: element.closest('[user-name]')?.getAttribute('user-name') ?? '',
      };
    }),
  };
}

// A failure answers null ("image address not found"); without an answer the menu would ask to reload the page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== DESCRIBE_ACTION) {
    return;
  }
  try {
    sendResponse(describeImageLayers());
  } catch (error) {
    console.warn(`describing the image failed: ${error.name}`);
    sendResponse(null);
  }
});
