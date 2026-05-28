/**
 * Electron Builder Configuration for HyperDrop Desktop.
 *
 * Builds:
 *   - Windows: NSIS installer (.exe)
 *   - Linux: AppImage
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
    'server/**/*.js',
    'desktop/**/*.js',
    'package.json',
  ],

  extraMetadata: {
    main: 'desktop/main.js',
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
        target: 'AppImage',
        arch: ['x64'],
      },
    ],
    icon: 'public/icon.png',
    category: 'Utility',
    artifactName: 'HyperDrop-${version}.${ext}',
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
