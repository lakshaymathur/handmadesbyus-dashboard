/**
 * Where the app serves a product photo (src/app/api/photos/[id]/route.ts): only
 * signed-in users can load it, and the storage service needn't be reachable from browsers.
 */
export function photoUrl(photoId: string): string {
  return `/api/photos/${photoId}`;
}
