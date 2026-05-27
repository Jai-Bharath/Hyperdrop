import FtpSrv from 'ftp-srv'
import { DOWNLOADS_DIR, getLocalIp } from './httpServer.js'

export async function startFtpServer(): Promise<void> {
  try {
    const ip = getLocalIp()

    const ftpServer = new FtpSrv({
      url: `ftp://0.0.0.0:2121`,
      anonymous: true,
      pasv_url: ip,
      pasv_min: 3002,
      pasv_max: 3010,
    })

    ftpServer.on(
      'login',
      (
        _data: { username: string },
        resolve: (opts: { root: string }) => void,
      ) => {
        // Accept all logins (anonymous), root to downloads dir
        resolve({ root: DOWNLOADS_DIR })
      },
    )

    ;(ftpServer as any).on('client-error', (connection: any, error: Error) => {
      console.error(`[ftp] Client error (${connection?.id ?? 'unknown'}):`, error.message)
    })

    await ftpServer.listen()
    console.log(`[ftp] FTP server running on ftp://${ip}:2121`)
    console.log(`[ftp] Passive port range: 3002-3010`)
    console.log(`[ftp] Root directory: ${DOWNLOADS_DIR}`)
  } catch (err) {
    // Log but never crash — FTP is optional functionality
    console.error('[ftp] Failed to start FTP server:', err)
    console.error('[ftp] FTP will be unavailable this session')
  }
}
