/**
 * Electron Builder Configuration for HyperDrop Desktop.
 *
 * Builds:
 *   - Windows: NSIS installer (.exe)
 *   - Linux: AppImage, DEB package
 *   - macOS: DMG (optional)
 */

const config = {
  appId: 'app.hyperdrop.desktop',
  productName: 'HyperDrop',
  copyright: 'Copyright © 2024 HyperDrop',

  directories: {
    output: 'release',
    buildResources: 'public',
  },

  files: [
    'dist/**/*',
    'server-dist/**/*',
    'package.json',
  ],

  extraMetadata: {
    main: 'server-dist/desktop/main.js',
  },

  // ── Windows ──
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'public/icon.png',
    artifactName: 'HyperDrop-${version}-Setup.${ext}',
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'HyperDrop',
    installerIcon: 'public/icon.png',
    uninstallerIcon: 'public/icon.png',
  },

  // ── Linux ──
  linux: {
    target: [
      {
        target: 'deb',
        arch: ['x64'],
      },
      {
        target: 'AppImage',
        arch: ['x64'],
      },
    ],
    icon: 'public/icon.png',
    category: 'Utility',
    artifactName: 'hyperdrop_${version}_${arch}.${ext}',
  },

  // ── macOS ──
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
    ],
    icon: 'public/icon.png',
    artifactName: 'HyperDrop-${version}.${ext}',
  },

  // Don't publish anywhere (fully offline)
  publish: null,
};

module.exports = config;
