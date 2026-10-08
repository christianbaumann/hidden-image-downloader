// Synthetic JoyClub GraphQL data: invented ids, UUIDs and titles.
export const IMAGE_BASE = 'https://image-user.feig-partner.de';
const SIZES = [1920, 240];

export const testUuid = (n) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;

export const sourceListJson = (base, uuid, key = 'k') => JSON.stringify([
  { mimeType: 'image/webp', sourceSet: SIZES.map((w) => ({ width: w, path: `${base}/${uuid}/orig/image_${w}_${key}.webp?cache=c` })) },
  { mimeType: 'image/jpeg', sourceSet: SIZES.map((w) => ({ width: w, path: `${base}/${uuid}/orig/image_${w}_${key}.jpg?cache=c` })) },
]);

// albums: [{ id, title, ids } | { id, title, restricted: true, imageCount }]
export function listResult({ main = [], albums = [] }) {
  return {
    __typename: 'ProfileAlbumListByUserIdSuccess',
    mainAlbum: { userImageIdList: main },
    regularAlbumResultList: albums.map((album) => (album.restricted
      ? { __typename: 'ProfileRestrictedRegularAlbum', id: album.id, title: album.title, imageCount: album.imageCount }
      : { __typename: 'ProfilePublicRegularAlbum', id: album.id, title: album.title, userImageIdList: album.ids })),
  };
}

// photos: [{ id, uuid } | { id, notFound: true }] → sourceByImageIdList.itemList
export function sourcesResult(photos, base = IMAGE_BASE) {
  return photos.map((photo) => ({
    id: photo.id,
    result: photo.notFound
      ? { __typename: 'ProfileAlbumImageSourceNotFoundResult' }
      : { __typename: 'ProfileAlbumImageSourceSuccessResult', source: { sourceListJson: sourceListJson(base, photo.uuid) } },
  }));
}

// Main album + one public album + one restricted album, one photo each.
export function albumRaw(overrides = {}) {
  return {
    owner: 'TestOwner',
    mainAlbumTitle: 'Fotos von uns',
    list: listResult({
      main: ['101'],
      albums: [
        { id: '201', title: 'Aktuelles', ids: ['102'] },
        { id: '202', title: 'Lady', restricted: true, imageCount: 9 },
      ],
    }),
    sources: sourcesResult([{ id: '101', uuid: testUuid(1) }, { id: '102', uuid: testUuid(2) }]),
    ...overrides,
  };
}
