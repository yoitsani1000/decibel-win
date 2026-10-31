const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const dataDir = ipcRenderer.sendSync('data-dir');

const AUDIO = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'aiff', 'aif', 'caf']);
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

function extOf(name) {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function abs(rel) {
  const full = path.resolve(dataDir, ...rel.split('/'));
  if (full !== dataDir && !full.startsWith(dataDir + path.sep)) {
    throw new Error('Path is outside the Decibel folder');
  }
  return full;
}

function exists(full) {
  try {
    return fs.statSync(full).isFile();
  } catch {
    return false;
  }
}

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

/** The iPhone writes full container paths. Only the file name matters here. */
function baseName(stored) {
  const last = String(stored).split(/[\\/]/).pop() || '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

contextBridge.exposeInMainWorld('decibel', {
  dataDir,
  readJson(name) {
    try {
      return JSON.parse(fs.readFileSync(abs(name), 'utf8'));
    } catch {
      return null;
    }
  },
  writeJson(name, value) {
    const target = abs(name);
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value));
    fs.renameSync(temp, target);
  },
  /** Finds a stored file wherever it is, tidies it into preferredDir and returns its relative path. */
  locate(stored, preferredDir) {
    const name = baseName(stored);
    if (!name) {
      return null;
    }
    const candidates = [`${preferredDir}/${name}`, name, `Inbox/${name}`];
    for (const rel of candidates) {
      if (!exists(abs(rel))) {
        continue;
      }
      if (rel.startsWith(`${preferredDir}/`)) {
        return rel;
      }
      const target = `${preferredDir}/${name}`;
      if (!exists(abs(target))) {
        try {
          moveFile(abs(rel), abs(target));
          return target;
        } catch {
          return rel;
        }
      }
      return rel;
    }
    return null;
  },
  /** Audio and pictures sitting loose in the main folder or Inbox. */
  listLoose() {
    const found = [];
    for (const dir of ['', 'Inbox']) {
      let names = [];
      try {
        names = fs.readdirSync(abs(dir || '.'));
      } catch {
        continue;
      }
      for (const name of names) {
        const ext = extOf(name);
        if (!AUDIO.has(ext) && !IMAGE.has(ext)) {
          continue;
        }
        const rel = dir ? `${dir}/${name}` : name;
        if (exists(abs(rel))) {
          found.push({ path: abs(rel), name });
        }
      }
    }
    return found;
  },
  /** mode: copy keeps the source, move relocates it. */
  importFile(sourcePath, destRel, mode) {
    const to = abs(destRel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (mode === 'move') {
      moveFile(sourcePath, to);
    } else {
      fs.copyFileSync(sourcePath, to);
    }
  },
  exists(rel) {
    return exists(abs(rel));
  },
  remove(rel) {
    try {
      fs.unlinkSync(abs(rel));
    } catch {
      // already gone
    }
  },
  toUrl(rel) {
    return pathToFileURL(abs(rel)).href;
  },
  pathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  chooseFiles: (kind) => ipcRenderer.invoke('choose-files', kind),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  onFocus(callback) {
    ipcRenderer.on('window-focus', () => callback());
  },
  onMedia(callback) {
    ipcRenderer.on('media', (_event, action) => callback(action));
  },
});
