'use strict';

/* Decibel for Windows. Reads and writes the same folder layout as the iPhone app:
   tracks_metadata.json, playlists.json, skin_settings.json, library_settings.json,
   plus Songs/, Artwork/ and Inbox/. */

const api = window.decibel;

/* ------------------------------- Constants -------------------------------- */

const ACCENTS = [
  { label: 'Green', color: '#1DB954' },
  { label: 'Blue', color: '#2E8BFF' },
  { label: 'Purple', color: '#8352F5' },
  { label: 'Pink', color: '#FF2E93' },
  { label: 'Orange', color: '#FF7A1A' },
];
const SORT_LABELS = {
  custom: 'Custom order',
  added: 'Import order',
  recent: 'Recently added',
  title: 'Title',
  artist: 'Artist',
};
const LIBRARY_SORTS = ['added', 'recent', 'title', 'artist'];
const PLAYLIST_SORTS = ['custom', 'recent', 'title', 'artist'];
const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'aiff', 'aif', 'caf']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const DEFAULT_ARTIST = 'Unknown Artist';
const DEFAULT_ALBUM = 'Local Files';

/* --------------------------------- State ---------------------------------- */

const S = {
  tracks: [],
  hiddenTracks: [], // records whose file is missing right now; kept so a partial copy loses nothing
  playlists: [],
  accent: ACCENTS[0].color,
  librarySort: 'added',
  tab: 'songs',
  filter: null,
  likedOnly: false,
  openPl: null,
  reordering: false,
  trayOpen: false,
  npOpen: false,
  sheet: null,
  search: '',
  queue: [],
  ctx: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
  queueOpen: false,
  importing: false,
};

const $ = (id) => document.getElementById(id);
const audio = $('audio');
let counter = 0;
const lastWritten = {};

/* -------------------------------- Helpers --------------------------------- */

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}
function stripExt(name) {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
}
function isAudio(name) {
  return AUDIO_EXT.has(extOf(name));
}
function isImage(name) {
  return IMAGE_EXT.has(extOf(name));
}
function baseKey(name) {
  return stripExt(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
function slugSuffix(name) {
  const slug = stripExt(name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug ? `-${slug}` : '';
}
function uid() {
  counter += 1;
  return `${Date.now()}-${counter}`;
}
function plId() {
  counter += 1;
  return `pl-${Date.now()}-${counter}`;
}
function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) {
    return '0:00';
  }
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function shuffled(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function countLabel(n) {
  return `${n} ${n === 1 ? 'song' : 'songs'}`;
}
/** "Artist - Title - Album", "Artist - Title" or just "Title". */
function parseNames(fileName) {
  const base = stripExt(fileName).replace(/_/g, ' ').trim();
  const parts = base.split(' - ').map((p) => p.trim());
  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
    return { artist: parts[0], title: parts.slice(1, -1).join(' - '), album: parts[parts.length - 1] };
  }
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { artist: parts[0], title: parts.slice(1).join(' - '), album: '' };
  }
  return { title: base || 'Untitled', artist: DEFAULT_ARTIST, album: '' };
}
function trackKeys(t) {
  const keys = [baseKey(t.title), baseKey(`${t.artist} - ${t.title}`)];
  if (t.sourceName) {
    keys.push(baseKey(t.sourceName));
  }
  return keys;
}
function addedAt(t) {
  const n = Number(String(t.id).split('-')[0]);
  return Number.isFinite(n) ? n : 0;
}
function cmp(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}
function sortTracks(list, sort) {
  if (sort === 'custom' || sort === 'added') {
    return list;
  }
  const idx = list.map((t, i) => ({ t, i }));
  idx.sort((a, b) => {
    let r;
    if (sort === 'recent') {
      r = addedAt(b.t) - addedAt(a.t);
    } else if (sort === 'title') {
      r = cmp(a.t.title, b.t.title);
    } else {
      r = cmp(a.t.artist, b.t.artist) || cmp(a.t.title, b.t.title);
    }
    if (r !== 0) {
      return r;
    }
    return sort === 'recent' ? b.i - a.i : a.i - b.i;
  });
  return idx.map((e) => e.t);
}
function byId() {
  return new Map(S.tracks.map((t) => [t.id, t]));
}
function trackById(id) {
  return S.tracks.find((t) => t.id === id) || null;
}
/** Square artwork with the music note placeholder, like the iPhone app. */
function thumb(rel, size = 48, radius = 4) {
  const bg = rel ? `background-image:url("${api.toUrl(rel)}");` : '';
  return `<span class="art" style='width:${size}px;height:${size}px;border-radius:${radius}px;${bg}'>${rel ? '' : icon('musical-note', Math.round(size * 0.45))}</span>`;
}
function onAccent(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.4 ? '#000000' : '#FFFFFF';
}
function toast(text) {
  const el = $('toast');
  el.innerHTML = `<span>${esc(text)}</span>`;
  el.hidden = false;
  clearTimeout(toast.timer);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 1800);
}

/* ------------------------------ Persistence ------------------------------- */

const saveTimers = {};
function writeSoon(name, build) {
  clearTimeout(saveTimers[name]);
  saveTimers[name] = setTimeout(() => {
    try {
      const value = build();
      lastWritten[name] = JSON.stringify(value);
      api.writeJson(name, value);
    } catch (error) {
      toast(`Could not save ${name}`);
      console.error(error);
    }
  }, 150);
}
const uriFor = (rel) => `file:///Documents/${rel}`;
function saveTracks() {
  writeSoon('tracks_metadata.json', () => [
    ...S.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      uri: uriFor(t.rel),
      artwork: t.art ? uriFor(t.art) : null,
      liked: t.liked,
      sourceName: t.sourceName,
      album: t.album,
    })),
    ...S.hiddenTracks,
  ]);
}
function savePlaylists() {
  writeSoon('playlists.json', () =>
    S.playlists.map((p) => ({
      id: p.id,
      name: p.name,
      trackIds: p.trackIds,
      cover: p.cover ? uriFor(p.cover) : null,
      sort: p.sort,
    })),
  );
}
function saveSkin() {
  writeSoon('skin_settings.json', () => ({ accent: S.accent }));
}
function saveLibrarySettings() {
  writeSoon('library_settings.json', () => ({ sort: S.librarySort }));
}

function loadFromDisk() {
  const rawTracks = api.readJson('tracks_metadata.json');
  const tracks = [];
  const hidden = [];
  if (Array.isArray(rawTracks)) {
    for (const item of rawTracks) {
      if (!item || typeof item.id !== 'string' || typeof item.uri !== 'string') {
        continue;
      }
      const rel = api.locate(item.uri, 'Songs');
      if (!rel) {
        hidden.push(item);
        continue;
      }
      tracks.push({
        id: item.id,
        title: typeof item.title === 'string' ? item.title : 'Untitled',
        artist: typeof item.artist === 'string' ? item.artist : DEFAULT_ARTIST,
        album: typeof item.album === 'string' ? item.album : '',
        liked: item.liked === true,
        sourceName: typeof item.sourceName === 'string' ? item.sourceName : '',
        rel,
        art: typeof item.artwork === 'string' && item.artwork ? api.locate(item.artwork, 'Artwork') : null,
      });
    }
  }
  const rawPlaylists = api.readJson('playlists.json');
  const playlists = [];
  if (Array.isArray(rawPlaylists)) {
    for (const item of rawPlaylists) {
      if (!item || typeof item.id !== 'string' || !Array.isArray(item.trackIds)) {
        continue;
      }
      playlists.push({
        id: item.id,
        name: typeof item.name === 'string' ? item.name : 'Playlist',
        trackIds: item.trackIds.filter((x) => typeof x === 'string'),
        cover: typeof item.cover === 'string' && item.cover ? api.locate(item.cover, 'Artwork') : null,
        sort: PLAYLIST_SORTS.includes(item.sort) ? item.sort : 'custom',
      });
    }
  }
  const skin = api.readJson('skin_settings.json');
  const accent = skin && ACCENTS.some((a) => a.color === skin.accent) ? skin.accent : ACCENTS[0].color;
  const settings = api.readJson('library_settings.json');
  const sort = settings && LIBRARY_SORTS.includes(settings.sort) ? settings.sort : 'added';
  S.tracks = tracks;
  S.hiddenTracks = hidden;
  S.playlists = playlists;
  S.accent = accent;
  S.librarySort = sort;
  // Rewrite once so the paths use the shared "file:///Documents/..." form the iPhone understands.
  saveTracks();
  savePlaylists();
}

/** Re-reads the folder when it changed outside the app (for example after copying it over). */
function refreshIfChanged() {
  const before = {
    t: lastWritten['tracks_metadata.json'],
    p: lastWritten['playlists.json'],
  };
  const t = api.readJson('tracks_metadata.json');
  const p = api.readJson('playlists.json');
  const tracksChanged = before.t === undefined || JSON.stringify(t) !== before.t;
  const playlistsChanged = before.p === undefined || JSON.stringify(p) !== before.p;
  if (tracksChanged || playlistsChanged) {
    loadFromDisk();
    applyAccent();
    renderAll();
  }
}

/* -------------------------------- Importing ------------------------------- */

let importChain = Promise.resolve();
function importFiles(files) {
  const run = importChain.then(() => processFiles(files));
  importChain = run.catch(() => {});
  return run;
}

async function processFiles(files) {
  if (files.length === 0) {
    return;
  }
  S.importing = true;
  const skipped = [];
  const images = files.filter((f) => isImage(f.name));
  const audioFiles = files.filter((f) => isAudio(f.name));
  const imageByKey = new Map(images.map((f) => [baseKey(f.name), f]));
  const used = new Set();
  const artById = new Map();
  const added = [];

  const importArt = (image, ownerId) => {
    const dest = `Artwork/${ownerId}-art-${Date.now()}.${extOf(image.name) || 'jpg'}`;
    api.importFile(image.path, dest, image.mode);
    return dest;
  };

  for (const file of audioFiles) {
    try {
      const id = uid();
      const rel = `Songs/${id}${slugSuffix(file.name)}.${extOf(file.name)}`;
      api.importFile(file.path, rel, file.mode);
      const names = parseNames(file.name);
      const match =
        imageByKey.get(baseKey(file.name)) ||
        imageByKey.get(baseKey(`${names.artist} - ${names.title}`)) ||
        imageByKey.get(baseKey(names.title));
      let art = null;
      if (match && !used.has(match)) {
        used.add(match);
        try {
          art = importArt(match, id);
        } catch {
          skipped.push(match.name);
        }
      }
      added.push({ id, title: names.title, artist: names.artist, album: names.album, liked: false, sourceName: stripExt(file.name), rel, art });
    } catch {
      skipped.push(file.name);
    }
  }

  const owners = [...S.tracks, ...added];
  for (const image of images) {
    if (used.has(image)) {
      continue;
    }
    const key = baseKey(image.name);
    const owner = owners.find((t) => trackKeys(t).includes(key));
    if (!owner) {
      if (image.mode === 'copy') {
        skipped.push(`${image.name} (no song with this name)`);
      }
      continue;
    }
    try {
      const dest = importArt(image, owner.id);
      const previous = artById.get(owner.id) || owner.art;
      artById.set(owner.id, dest);
      if (previous) {
        api.remove(previous);
      }
    } catch {
      skipped.push(image.name);
    }
  }

  for (const t of [...S.tracks, ...added]) {
    if (artById.has(t.id)) {
      t.art = artById.get(t.id);
    }
  }
  S.tracks.push(...added);
  S.importing = false;
  if (added.length > 0 || artById.size > 0) {
    saveTracks();
    renderAll();
  }
  if (added.length > 0) {
    toast(`Imported ${countLabel(added.length)}`);
  }
  if (skipped.length > 0) {
    setTimeout(() => toast(`Skipped: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '...' : ''}`), added.length > 0 ? 1900 : 0);
  }
}

function scanLoose() {
  const loose = api.listLoose().map((f) => ({ ...f, mode: 'move' }));
  void importFiles(loose);
}

/* -------------------------------- Playback -------------------------------- */

function currentId() {
  return S.index >= 0 ? S.queue[S.index] : null;
}
function currentTrack() {
  const id = currentId();
  return id ? trackById(id) : null;
}

function loadAndPlay(startPlaying = true) {
  const t = currentTrack();
  if (!t) {
    audio.removeAttribute('src');
    audio.load();
    updatePlayer();
    return;
  }
  audio.src = api.toUrl(t.rel);
  if (startPlaying) {
    audio.play().catch((e) => {
      console.error(e);
      toast(`Could not play ${t.title}`);
    });
  }
  updatePlayer();
  markPlaying();
  if (S.queueOpen) {
    renderQueue();
  }
}

function playContext(ids, startId, shuffle) {
  const valid = ids.filter((id) => trackById(id));
  if (valid.length === 0) {
    return;
  }
  S.ctx = valid;
  S.shuffle = shuffle;
  if (shuffle) {
    const first = startId && valid.includes(startId) ? startId : null;
    const rest = shuffled(valid.filter((id) => id !== first));
    S.queue = first ? [first, ...rest] : rest;
    S.index = 0;
  } else {
    S.queue = [...valid];
    S.index = Math.max(0, valid.indexOf(startId));
  }
  loadAndPlay();
}

function playAt(index) {
  if (index < 0 || index >= S.queue.length) {
    return;
  }
  S.index = index;
  loadAndPlay();
}

function next(auto = false) {
  if (S.queue.length === 0) {
    return;
  }
  if (auto && S.repeat === 'one') {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  if (S.index + 1 < S.queue.length) {
    playAt(S.index + 1);
  } else if (S.repeat === 'all') {
    playAt(0);
  } else if (auto) {
    audio.pause();
    audio.currentTime = 0;
    updatePlayer();
  }
}

function previous() {
  if (S.queue.length === 0) {
    return;
  }
  if (audio.currentTime > 3 || S.index <= 0) {
    audio.currentTime = 0;
    return;
  }
  playAt(S.index - 1);
}

function togglePlay() {
  if (!currentTrack()) {
    const ids = visibleTracks().map((t) => t.id);
    if (ids.length > 0) {
      playContext(ids, ids[0], S.shuffle);
    }
    return;
  }
  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

function toggleShuffle() {
  S.shuffle = !S.shuffle;
  if (S.index >= 0) {
    const head = S.queue.slice(0, S.index + 1);
    let upcoming = S.queue.slice(S.index + 1);
    if (S.shuffle) {
      upcoming = shuffled(upcoming);
    } else {
      const order = new Map(S.ctx.map((id, i) => [id, i]));
      upcoming.sort((a, b) => (order.has(a) ? order.get(a) : 1e9) - (order.has(b) ? order.get(b) : 1e9));
    }
    S.queue = [...head, ...upcoming];
  }
  updatePlayer();
  if (S.queueOpen) {
    renderQueue();
  }
}

function cycleRepeat() {
  S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off';
  updatePlayer();
}

function enqueue(id, playNextFlag) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  if (S.queue.length === 0 || S.index < 0) {
    playContext([id], id, false);
    toast('Playing now');
    return;
  }
  const existing = S.queue.indexOf(id);
  if (existing === S.index) {
    toast('Already playing');
    return;
  }
  if (!playNextFlag) {
    if (existing >= 0) {
      toast('Already in the queue');
      return;
    }
    S.queue.push(id);
    toast('Added to queue');
  } else {
    const curId = currentId();
    if (existing >= 0) {
      S.queue.splice(existing, 1);
    }
    S.index = S.queue.indexOf(curId);
    S.queue.splice(S.index + 1, 0, id);
    toast('Playing next');
  }
  if (S.queueOpen) {
    renderQueue();
  }
}

function purgeFromQueue(id) {
  const cur = currentId();
  S.ctx = S.ctx.filter((x) => x !== id);
  if (cur === id) {
    audio.pause();
    S.queue = S.queue.filter((x) => x !== id);
    S.index = -1;
    loadAndPlay(false);
  } else {
    S.queue = S.queue.filter((x) => x !== id);
    S.index = cur ? S.queue.indexOf(cur) : -1;
  }
}

audio.addEventListener('ended', () => next(true));
audio.addEventListener('play', () => updatePlayButtons());
audio.addEventListener('pause', () => updatePlayButtons());
audio.addEventListener('error', () => {
  const t = currentTrack();
  if (t) {
    toast(`Cannot play ${t.title}`);
  }
});
audio.addEventListener('loadedmetadata', () => onTime());
audio.addEventListener('timeupdate', () => onTime());
