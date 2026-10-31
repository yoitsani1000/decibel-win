const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

// Media keys are handled below with globalShortcut, so turn off Chromium's own handler
// (otherwise one key press would fire twice).
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');

const configFile = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2));
}

function getDataDir() {
  const saved = readConfig().dataDir;
  const dir = typeof saved === 'string' && saved ? saved : path.join(app.getPath('documents'), 'Decibel');
  for (const sub of ['', 'Songs', 'Artwork', 'Inbox']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'Decibel',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('focus', () => win.webContents.send('window-focus'));
  win.on('closed', () => {
    win = null;
  });
}

function sendMedia(action) {
  if (win) {
    win.webContents.send('media', action);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ipcMain.on('data-dir', (event) => {
      event.returnValue = getDataDir();
    });
    ipcMain.handle('choose-files', async (_event, kind) => {
      const filters =
        kind === 'image'
          ? [{ name: 'Pictures', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] }]
          : [
              {
                name: 'Songs and pictures',
                extensions: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'aiff', 'aif', 'caf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
              },
            ];
      const result = await dialog.showOpenDialog(win, {
        properties: kind === 'image' ? ['openFile'] : ['openFile', 'multiSelections'],
        filters,
      });
      return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle('choose-folder', async () => {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose the Decibel folder (the one that holds Songs and Artwork)',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return false;
      }
      writeConfig({ ...readConfig(), dataDir: result.filePaths[0] });
      win.reload();
      return true;
    });
    ipcMain.handle('open-folder', async () => {
      await shell.openPath(getDataDir());
    });

    createWindow();

    const keys = {
      MediaPlayPause: 'toggle',
      MediaNextTrack: 'next',
      MediaPreviousTrack: 'previous',
      MediaStop: 'stop',
    };
    for (const [key, action] of Object.entries(keys)) {
      try {
        globalShortcut.register(key, () => sendMedia(action));
      } catch {
        // Another app may own the key. Playback still works from the window.
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
