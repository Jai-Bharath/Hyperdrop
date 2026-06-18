/**
 * FTP URL helper for HyperDrop.
 *
 * Browsers cannot run FTP clients directly, so this module only generates
 * FTP URLs for use in the NoAppModal (user opens in their file manager).
 */

/**
 * Generate an FTP connection URL.
 * @example getFtpUrl('192.168.1.10', 2121) → 'ftp://192.168.1.10:2121'
 */
export function getFtpUrl(ip: string, port: number): string {
  return `ftp://${ip}:${port}`;
}

/**
 * Generate an FTP browse URL (with trailing slash for directory listing).
 * @example getFtpBrowseUrl('192.168.1.10', 2121) → 'ftp://192.168.1.10:2121/'
 */
export function getFtpBrowseUrl(ip: string, port: number): string {
  return `ftp://${ip}:${port}/`;
}
