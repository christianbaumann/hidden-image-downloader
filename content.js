// Runs on JoyClub pages. Remembers the last right-click; the "Save hidden image" menu asks for the image layers below it.
// A content script is no ES module: DESCRIBE_ACTION is repeated in background.js.
const DESCRIBE_ACTION = 'describe-hidden-image';
// Same value as FSK18_STATUS_ACTION in background.js.
const FSK18_STATUS_ACTION = 'fsk18-status';
// Photos behind JoyClub's FSK18 activation link: the page serves only their pixelated variant.
const FSK18_GATE_LINK = 'a[href*="/webauth/activate/fsk18/"]';

let lastContextMenu = null;

// Top frame only: the page's FSK18 status goes to the service worker, which unlocks and reloads a locked page
// when a password is stored.
if (window === window.top) {
  document.addEventListener('DOMContentLoaded', () => {
    const status = document.body?.dataset.sessionFsk18Status;
    if (status === undefined) {
      return;
    }
    // After an extension reload the old content script has no extension context: sendMessage throws.
    try {
      chrome.runtime.sendMessage({ action: FSK18_STATUS_ACTION, status }).catch(() => {});
    } catch {
      // Nothing to unlock with.
    }
  });
}

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
  const checked = new Set(hit);
  return hit.flatMap((element) => {
    const hidden = [...element.querySelectorAll('*')].filter((child) => {
      if (checked.has(child)) {
        return false;
      }
      checked.add(child);
      return containsPoint(child, point) && window.getComputedStyle(child).visibility !== 'hidden';
    });
    return [...hidden.reverse(), element];
  });
}

// The album title is the last headline before the album's photos; the own profile shows an "Account" headline earlier.
function albumTitle(albumLinks) {
  const headlines = [...document.querySelectorAll('h2.profile-headline')];
  const [firstLink] = albumLinks;
  const before = firstLink
    ? headlines.filter((headline) => headline.compareDocumentPosition(firstLink) & window.Node.DOCUMENT_POSITION_FOLLOWING)
    : headlines;
  return textOf(before.at(-1));
}

function describeImageLayers() {
  if (!lastContextMenu) {
    return null;
  }
  const albumLinks = [...document.querySelectorAll('a.album-link')];
  return {
    pageUrl: location.href,
    owner: textOf(document.querySelector('h1.profile-base-info__user-name')),
    album: albumTitle(albumLinks),
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
        title: textOf(element.closest('.lightbox_slide')?.querySelector('.lb_img_title')),
        userName: element.closest('[user-name]')?.getAttribute('user-name') ?? '',
        gated: element.closest(FSK18_GATE_LINK) !== null,
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
