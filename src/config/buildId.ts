/** Changes on every build (vite.config.ts). */
export const BUILD_ID: string = __BUILD_ID__;

/**
 * `url` with the build id appended. Each build's asset URLs are unique, so the service
 * worker can serve them cache-first forever and a deploy can never mix old and new files.
 */
export function versionedUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${BUILD_ID}`;
}
