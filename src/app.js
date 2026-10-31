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
  view: { type: 'library', id: null },
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
function artStyle(rel) {
  return rel ? `background-image:url("${api.toUrl(rel)}")` : '';
}
function thumb(rel, cls = '') {
  return `<span class="thumb ${cls}" style='${artStyle(rel)}'>${rel ? '' : '&#9835;'}</span>`;
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
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
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
audio.addEventListener('play', updatePlayButton);
audio.addEventListener('pause', updatePlayButton);
audio.addEventListener('error', () => {
  const t = currentTrack();
  if (t) {
    toast(`Cannot play ${t.title}`);
  }
});
audio.addEventListener('loadedmetadata', () => {
  $('tDur').textContent = fmtTime(audio.duration);
});
let scrubbing = false;
audio.addEventListener('timeupdate', () => {
  if (scrubbing) {
    return;
  }
  const d = audio.duration;
  const ratio = Number.isFinite(d) && d > 0 ? audio.currentTime / d : 0;
  setRange($('seek'), ratio * 1000, 1000);
  $('tCur').textContent = fmtTime(audio.currentTime);
});

function setRange(input, value, max) {
  input.value = value;
  input.style.setProperty('--fill', `${(value / max) * 100}%`);
}

$('seek').addEventListener('input', (e) => {
  scrubbing = true;
  const v = Number(e.target.value);
  setRange(e.target, v, 1000);
  const d = audio.duration;
  if (Number.isFinite(d)) {
    $('tCur').textContent = fmtTime((v / 1000) * d);
  }
});
$('seek').addEventListener('change', (e) => {
  const d = audio.duration;
  if (Number.isFinite(d)) {
    audio.currentTime = (Number(e.target.value) / 1000) * d;
  }
  scrubbing = false;
});
$('volume').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  audio.volume = v / 100;
  setRange(e.target, v, 100);
  try {
    localStorage.setItem('decibel.volume', String(v));
  } catch {
    // ignore
  }
});

/* ---------------------------------- Views --------------------------------- */

function playlistById(id) {
  return S.playlists.find((p) => p.id === id) || null;
}

function visibleTracks() {
  const v = S.view;
  if (v.type === 'playlist') {
    const p = playlistById(v.id);
    if (!p) {
      return [];
    }
    const map = byId();
    const members = p.trackIds.map((id) => map.get(id)).filter(Boolean);
    return sortTracks(members, p.sort);
  }
  let base = v.type === 'liked' ? S.tracks.filter((t) => t.liked) : S.tracks;
  const needle = S.search.trim().toLowerCase();
  if (needle) {
    base = base.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle));
  }
  return sortTracks(base, S.librarySort);
}

function playlistCover(p) {
  if (p.cover) {
    return p.cover;
  }
  const map = byId();
  for (const id of p.trackIds) {
    const t = map.get(id);
    if (t && t.art) {
      return t.art;
    }
  }
  return null;
}

function applyAccent() {
  document.documentElement.style.setProperty('--accent', S.accent);
  document.documentElement.style.setProperty('--on-accent', onAccent(S.accent));
}

function renderSide() {
  document.querySelectorAll('.nav-item').forEach((el) => {
    const nav = el.dataset.nav;
    el.classList.toggle('active', S.view.type === nav);
  });
  $('playlistList').innerHTML = S.playlists
    .map((p) => {
      const count = p.trackIds.filter((id) => trackById(id)).length;
      return `<button class="pl-item ${S.view.type === 'playlist' && S.view.id === p.id ? 'active' : ''}" data-pl="${esc(p.id)}">
        ${thumb(playlistCover(p))}<span class="meta"><div>${esc(p.name)}</div><div>Playlist &bull; ${countLabel(count)}</div></span></button>`;
    })
    .join('');
  $('swatches').innerHTML = ACCENTS.map(
    (a) => `<button class="swatch ${a.color === S.accent ? 'on' : ''}" title="${a.label}" data-accent="${a.color}" style="background:${a.color}"></button>`,
  ).join('');
}

function renderTop() {
  const inPlaylist = S.view.type === 'playlist';
  $('search').parentElement.style.visibility = inPlaylist ? 'hidden' : 'visible';
  $('librarySort').style.display = inPlaylist ? 'none' : '';
  $('librarySort').innerHTML = LIBRARY_SORTS.map(
    (k) => `<option value="${k}" ${k === S.librarySort ? 'selected' : ''}>${SORT_LABELS[k]}</option>`,
  ).join('');
}

function rowHtml(t, i, opts) {
  const liked = t.liked ? 'on' : '';
  return `<div class="row ${t.id === currentId() ? 'playing' : ''}" data-id="${esc(t.id)}" data-i="${i}" ${opts.drag ? 'draggable="true"' : ''}>
    <div class="idx"><span class="n">${opts.drag ? '<span class="grip">&#8942;&#8942;</span>' : i + 1}</span><button class="play-hover" data-act="play">&#9654;</button></div>
    <div class="tcell">${thumb(t.art)}<div class="txt"><div class="title">${esc(t.title)}</div><div class="artist">${esc(t.artist)}</div></div></div>
    <div class="album">${esc(t.album || '')}</div>
    <button class="icon-btn like ${liked}" data-act="like" title="Like">${t.liked ? '&#9829;' : '&#9825;'}</button>
    <button class="icon-btn more" data-act="more" title="More">&#8943;</button>
  </div>`;
}

function renderView() {
  const view = $('view');
  const list = visibleTracks();
  const v = S.view;
  let head = '';
  let dragRows = false;
  let emptyHtml;
  if (v.type === 'playlist') {
    const p = playlistById(v.id);
    if (!p) {
      S.view = { type: 'library', id: null };
      renderAll();
      return;
    }
    dragRows = p.sort === 'custom';
    head = `<div class="pl-head">
      ${thumb(playlistCover(p), 'cover')}
      <div><div class="sub">Playlist</div><h1>${esc(p.name)}</h1><div class="sub">${countLabel(list.length)}</div>
        <div class="pl-actions">
          <button class="big-play" data-top="play" title="Play">&#9654;</button>
          <button class="pill" data-top="shuffle">Shuffle</button>
          <button class="pill" data-top="add">Add songs</button>
          <select data-top="sort" title="Sort playlist">${PLAYLIST_SORTS.map((k) => `<option value="${k}" ${k === p.sort ? 'selected' : ''}>${SORT_LABELS[k]}</option>`).join('')}</select>
          <button class="icon-btn" data-top="menu" title="Playlist options">&#8943;</button>
        </div>
        ${p.sort !== 'custom' ? '<div class="sub" style="margin-top:8px">Choose "Custom order" to drag songs into place.</div>' : ''}
      </div></div>`;
    emptyHtml = '<div class="empty"><h2>This playlist is empty</h2><p>Use Add songs to fill it.</p></div>';
  } else if (v.type === 'liked') {
    head = `<h1>Liked Songs</h1><div class="sub">${countLabel(list.length)}</div><div style="height:12px"></div>`;
    emptyHtml = '<div class="empty"><h2>No liked songs yet</h2><p>Click the heart on any song to save it here.</p></div>';
  } else {
    const searching = S.search.trim().length > 0;
    head = `<h1>${searching ? 'Search results' : 'Songs'}</h1><div class="sub">${countLabel(list.length)}</div><div style="height:12px"></div>`;
    emptyHtml = searching
      ? '<div class="empty"><h2>No matches</h2><p>Nothing in your songs matches your search.</p></div>'
      : '<div class="empty"><h2>Your songs live here</h2><p>Click Import, or drag audio files (and same-named pictures) onto this window.<br>You can also copy the Decibel folder from your iPhone.</p></div>';
  }
  const listHead = list.length
    ? '<div class="list-head"><span>#</span><span>Title</span><span>Album</span><span></span><span></span></div>'
    : '';
  view.innerHTML = `${head}${listHead}<div id="rows">${list.map((t, i) => rowHtml(t, i, { drag: dragRows })).join('')}</div>${list.length ? '' : emptyHtml}`;
}

function markPlaying() {
  const cur = currentId();
  document.querySelectorAll('#rows .row').forEach((row) => row.classList.toggle('playing', row.dataset.id === cur));
}

function renderAll() {
  applyAccent();
  renderSide();
  renderTop();
  renderView();
  updatePlayer();
  if (S.queueOpen) {
    renderQueue();
  }
}

function updatePlayButton() {
  $('btnPlay').innerHTML = audio.paused ? '&#9654;' : '&#10074;&#10074;';
  $('btnPlay').title = audio.paused ? 'Play' : 'Pause';
}

function updatePlayer() {
  const t = currentTrack();
  $('npTitle').textContent = t ? t.title : 'Nothing playing';
  $('npArtist').textContent = t ? `${t.artist}${t.album ? ` • ${t.album}` : ''}` : '';
  const art = $('npArt');
  art.innerHTML = thumb(t ? t.art : null);
  const like = $('npLike');
  like.innerHTML = t && t.liked ? '&#9829;' : '&#9825;';
  like.classList.toggle('on', Boolean(t && t.liked));
  like.style.visibility = t ? 'visible' : 'hidden';
  $('btnShuffle').classList.toggle('on', S.shuffle);
  const rep = $('btnRepeat');
  rep.classList.toggle('on', S.repeat !== 'off');
  rep.innerHTML = S.repeat === 'one' ? '&#8635;<sup style="font-size:9px">1</sup>' : '&#8635;';
  $('btnQueue').classList.toggle('on', S.queueOpen);
  document.title = t ? `${t.title} • ${t.artist}` : 'Decibel';
  updatePlayButton();
}

/* ------------------------------- Queue panel ------------------------------ */

function renderQueue() {
  const panel = $('queuePanel');
  panel.hidden = !S.queueOpen;
  if (!S.queueOpen) {
    return;
  }
  const cur = currentTrack();
  const upcoming = S.index >= 0 ? S.queue.slice(S.index + 1) : [];
  let html = `<div class="q-title"><span>Queue</span><span>
    <button class="pill" data-q="shuffle">Shuffle next</button>
    <button class="pill" data-q="clear">Clear</button></span></div>`;
  if (cur) {
    html += `<div class="q-label">NOW PLAYING</div><div class="qrow now">${thumb(cur.art)}<div class="txt"><div class="title">${esc(cur.title)}</div><div class="artist">${esc(cur.artist)}</div></div></div>`;
  }
  html += `<div class="q-label">NEXT UP</div><div id="qrows">`;
  if (upcoming.length === 0) {
    html += '<div class="sub" style="padding:8px">Nothing queued. Use Play next or Add to queue on any song.</div>';
  }
  upcoming.forEach((id, i) => {
    const t = trackById(id);
    if (!t) {
      return;
    }
    html += `<div class="qrow" draggable="true" data-i="${i}" data-id="${esc(id)}"><span class="grip">&#8942;&#8942;</span>${thumb(t.art)}<div class="txt" data-q="jump"><div class="title">${esc(t.title)}</div><div class="artist">${esc(t.artist)}</div></div><button class="icon-btn" data-q="remove" title="Remove">&times;</button></div>`;
  });
  html += '</div>';
  panel.innerHTML = html;
}

$('queuePanel').addEventListener('click', (e) => {
  const target = e.target.closest('[data-q]');
  if (!target) {
    return;
  }
  const action = target.dataset.q;
  const row = target.closest('.qrow');
  if (action === 'shuffle' && S.index >= 0) {
    S.queue = [...S.queue.slice(0, S.index + 1), ...shuffled(S.queue.slice(S.index + 1))];
  } else if (action === 'clear' && S.index >= 0) {
    S.queue = S.queue.slice(0, S.index + 1);
  } else if (action === 'jump' && row) {
    playAt(S.index + 1 + Number(row.dataset.i));
    return;
  } else if (action === 'remove' && row) {
    S.queue.splice(S.index + 1 + Number(row.dataset.i), 1);
  }
  renderQueue();
});

/* ---------------------------- Drag to reorder ----------------------------- */

function enableSortable(container, rowSelector, onMove) {
  let from = -1;
  let over = null;
  const clear = () => container.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest(rowSelector);
    if (!row) {
      return;
    }
    from = Number(row.dataset.i);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'decibel-row');
  });
  container.addEventListener('dragover', (e) => {
    if (from < 0) {
      return;
    }
    const row = e.target.closest(rowSelector);
    if (!row) {
      return;
    }
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    container.querySelectorAll('.drop-before,.drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    row.classList.add(after ? 'drop-after' : 'drop-before');
    over = { index: Number(row.dataset.i), after };
  });
  container.addEventListener('drop', (e) => {
    if (from < 0 || !over) {
      return;
    }
    e.preventDefault();
    let to = over.index + (over.after ? 1 : 0);
    if (from < to) {
      to -= 1;
    }
    const start = from;
    from = -1;
    over = null;
    clear();
    if (to !== start) {
      onMove(start, to);
    }
  });
  container.addEventListener('dragend', () => {
    from = -1;
    over = null;
    clear();
  });
}

/* ------------------------------ Library edits ----------------------------- */

function toggleLike(id) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  t.liked = !t.liked;
  saveTracks();
  if (S.view.type === 'liked') {
    renderView();
  } else {
    const row = document.querySelector(`#rows .row[data-id="${CSS.escape(id)}"] .like`);
    if (row) {
      row.classList.toggle('on', t.liked);
      row.innerHTML = t.liked ? '&#9829;' : '&#9825;';
    }
  }
  renderSide();
  updatePlayer();
}

function removeTrack(id) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  purgeFromQueue(id);
  S.tracks = S.tracks.filter((x) => x.id !== id);
  S.playlists.forEach((p) => {
    p.trackIds = p.trackIds.filter((x) => x !== id);
  });
  api.remove(t.rel);
  if (t.art) {
    api.remove(t.art);
  }
  saveTracks();
  savePlaylists();
  renderAll();
}

async function chooseArtworkFor(id) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  const [picked] = await api.chooseFiles('image');
  if (!picked) {
    return;
  }
  const dest = `Artwork/${id}-art-${Date.now()}.${extOf(picked) || 'jpg'}`;
  api.importFile(picked, dest, 'copy');
  if (t.art) {
    api.remove(t.art);
  }
  t.art = dest;
  saveTracks();
  renderAll();
}

function addToPlaylist(playlistId, trackId) {
  const p = playlistById(playlistId);
  if (!p) {
    return;
  }
  if (p.trackIds.includes(trackId)) {
    p.trackIds = p.trackIds.filter((x) => x !== trackId);
    toast(`Removed from ${p.name}`);
  } else {
    p.trackIds.push(trackId);
    toast(`Added to ${p.name}`);
  }
  savePlaylists();
  renderSide();
  if (S.view.type === 'playlist') {
    renderView();
  }
}

/* --------------------------------- Menus ---------------------------------- */

function closeMenu() {
  $('menu').hidden = true;
}
function showMenu(x, y, items) {
  const menu = $('menu');
  menu.innerHTML = '';
  for (const item of items) {
    if (item.heading) {
      const h = document.createElement('div');
      h.className = 'heading';
      h.textContent = item.heading;
      menu.appendChild(h);
      continue;
    }
    const b = document.createElement('button');
    b.innerHTML = `<span>${esc(item.label)}</span>${item.check ? '<span>&#10003;</span>' : ''}`;
    if (item.danger) {
      b.className = 'danger';
    }
    b.addEventListener('click', () => {
      if (item.keepOpen) {
        item.fn();
      } else {
        closeMenu();
        item.fn();
      }
    });
    menu.appendChild(b);
  }
  menu.hidden = false;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#menu')) {
    closeMenu();
  }
});

function playlistPicker(x, y, trackId) {
  const items = [{ heading: 'Add to playlist' }, { label: 'New playlist', fn: () => promptPlaylist('', (name) => {
    const p = { id: plId(), name, trackIds: [trackId], cover: null, sort: 'custom' };
    S.playlists.push(p);
    savePlaylists();
    renderSide();
    toast(`Added to ${name}`);
  }) }];
  for (const p of S.playlists) {
    items.push({ label: p.name, check: p.trackIds.includes(trackId), fn: () => addToPlaylist(p.id, trackId) });
  }
  showMenu(x, y, items);
}

function trackMenu(id, x, y) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  const items = [
    { label: t.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs', fn: () => toggleLike(id) },
    { label: 'Play next', fn: () => enqueue(id, true) },
    { label: 'Add to queue', fn: () => enqueue(id, false) },
    { label: 'Add to playlist...', keepOpen: true, fn: () => playlistPicker(x, y, id) },
  ];
  if (S.view.type === 'playlist') {
    const p = playlistById(S.view.id);
    if (p && p.trackIds.includes(id)) {
      items.push({ label: `Remove from ${p.name}`, fn: () => addToPlaylist(p.id, id) });
    }
  }
  items.push(
    { label: 'Edit details', fn: () => editModal(id) },
    { label: 'Choose artwork', fn: () => void chooseArtworkFor(id) },
    {
      label: 'Remove from library',
      danger: true,
      fn: () => {
        if (window.confirm(`"${t.title}" will be deleted from this computer's Decibel folder.`)) {
          removeTrack(id);
        }
      },
    },
  );
  showMenu(x, y, items);
}

function playlistMenu(id, x, y) {
  const p = playlistById(id);
  if (!p) {
    return;
  }
  const items = [
    { label: 'Rename', fn: () => promptPlaylist(p.name, (name) => {
      p.name = name;
      savePlaylists();
      renderAll();
    }) },
    { label: 'Change cover', fn: () => void setPlaylistCover(id) },
  ];
  if (p.cover) {
    items.push({ label: 'Remove cover', fn: () => {
      api.remove(p.cover);
      p.cover = null;
      savePlaylists();
      renderAll();
    } });
  }
  items.push({
    label: 'Delete playlist',
    danger: true,
    fn: () => {
      if (window.confirm(`"${p.name}" will be deleted. Your songs stay in the library.`)) {
        if (p.cover) {
          api.remove(p.cover);
        }
        S.playlists = S.playlists.filter((x) => x.id !== id);
        if (S.view.type === 'playlist' && S.view.id === id) {
          S.view = { type: 'library', id: null };
        }
        savePlaylists();
        renderAll();
      }
    },
  });
  showMenu(x, y, items);
}

async function setPlaylistCover(id) {
  const p = playlistById(id);
  if (!p) {
    return;
  }
  const [picked] = await api.chooseFiles('image');
  if (!picked) {
    return;
  }
  const dest = `Artwork/${id}-cover-${Date.now()}.${extOf(picked) || 'jpg'}`;
  api.importFile(picked, dest, 'copy');
  if (p.cover) {
    api.remove(p.cover);
  }
  p.cover = dest;
  savePlaylists();
  renderAll();
}

/* --------------------------------- Modals --------------------------------- */

function closeModal() {
  $('modalRoot').hidden = true;
  $('modalRoot').innerHTML = '';
}
function openModal(html) {
  const root = $('modalRoot');
  root.innerHTML = `<div class="modal">${html}</div>`;
  root.hidden = false;
  root.onmousedown = (e) => {
    if (e.target === root) {
      closeModal();
    }
  };
  return root.firstElementChild;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeMenu();
  }
});

function promptPlaylist(initial, onSubmit) {
  const m = openModal(`<h3>${initial ? 'Rename playlist' : 'New playlist'}</h3>
    <label>Name</label><input type="text" id="mName" maxlength="60" value="${esc(initial)}" placeholder="My playlist">
    <div class="actions"><button class="pill" id="mCancel">Cancel</button><button class="pill primary" id="mOk">${initial ? 'Save' : 'Create'}</button></div>`);
  const input = m.querySelector('#mName');
  input.focus();
  input.select();
  const submit = () => {
    const name = input.value.trim().slice(0, 60) || `Playlist ${S.playlists.length + 1}`;
    closeModal();
    onSubmit(name);
  };
  m.querySelector('#mOk').onclick = submit;
  m.querySelector('#mCancel').onclick = closeModal;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submit();
    }
  });
}

function editModal(id) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  const m = openModal(`<h3>Edit details</h3>
    <label>Title</label><input type="text" id="eTitle" value="${esc(t.title)}">
    <label>Artist</label><input type="text" id="eArtist" value="${esc(t.artist)}">
    <label>Album</label><input type="text" id="eAlbum" value="${esc(t.album)}" placeholder="${DEFAULT_ALBUM}">
    <div class="actions"><button class="pill" id="mCancel">Cancel</button><button class="pill primary" id="mOk">Save</button></div>`);
  m.querySelector('#eTitle').focus();
  m.querySelector('#mCancel').onclick = closeModal;
  const submit = () => {
    t.title = m.querySelector('#eTitle').value.trim() || t.title;
    t.artist = m.querySelector('#eArtist').value.trim() || DEFAULT_ARTIST;
    t.album = m.querySelector('#eAlbum').value.trim();
    closeModal();
    saveTracks();
    renderAll();
  };
  m.querySelector('#mOk').onclick = submit;
  m.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submit();
    }
  });
}

function addSongsModal(playlistId) {
  const p = playlistById(playlistId);
  if (!p) {
    return;
  }
  const selected = new Set(p.trackIds);
  const m = openModal(`<h3>Add songs to ${esc(p.name)}</h3>
    <input type="text" id="aSearch" placeholder="Search your songs">
    <div class="pick" id="aList"></div>
    <div class="actions"><button class="pill" id="mCancel">Cancel</button><button class="pill primary" id="mOk">Done</button></div>`);
  const list = m.querySelector('#aList');
  const draw = () => {
    const needle = m.querySelector('#aSearch').value.trim().toLowerCase();
    list.innerHTML = S.tracks
      .filter((t) => !needle || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle))
      .map((t) => `<label class="item"><input type="checkbox" data-id="${esc(t.id)}" ${selected.has(t.id) ? 'checked' : ''}>${thumb(t.art)}<span><div>${esc(t.title)}</div><div class="sub" style="font-size:12px">${esc(t.artist)}</div></span></label>`)
      .join('');
  };
  draw();
  m.querySelector('#aSearch').addEventListener('input', draw);
  list.addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    if (e.target.checked) {
      selected.add(id);
    } else {
      selected.delete(id);
    }
  });
  m.querySelector('#mCancel').onclick = closeModal;
  m.querySelector('#mOk').onclick = () => {
    const kept = p.trackIds.filter((id) => selected.has(id) || !trackById(id));
    const keptSet = new Set(kept);
    const added = S.tracks.map((t) => t.id).filter((id) => selected.has(id) && !keptSet.has(id));
    p.trackIds = [...kept, ...added];
    closeModal();
    savePlaylists();
    renderAll();
  };
}

/* ---------------------------------- Events -------------------------------- */

$('view').addEventListener('click', (e) => {
  const top = e.target.closest('[data-top]');
  if (top) {
    const p = playlistById(S.view.id);
    if (!p) {
      return;
    }
    const kind = top.dataset.top;
    const ids = visibleTracks().map((t) => t.id);
    if (kind === 'play') {
      playContext(ids, ids[0], false);
    } else if (kind === 'shuffle') {
      playContext(ids, null, true);
    } else if (kind === 'add') {
      addSongsModal(p.id);
    } else if (kind === 'menu') {
      const r = top.getBoundingClientRect();
      playlistMenu(p.id, r.left, r.bottom + 4);
    }
    return;
  }
  const row = e.target.closest('.row');
  if (!row) {
    return;
  }
  const id = row.dataset.id;
  const act = e.target.closest('[data-act]');
  if (act && act.dataset.act === 'like') {
    toggleLike(id);
  } else if (act && act.dataset.act === 'more') {
    const r = act.getBoundingClientRect();
    trackMenu(id, r.left - 180, r.bottom + 4);
  } else if (act && act.dataset.act === 'play') {
    playRow(id);
  }
});
$('view').addEventListener('change', (e) => {
  if (e.target.dataset.top === 'sort') {
    const p = playlistById(S.view.id);
    if (p) {
      p.sort = e.target.value;
      savePlaylists();
      renderView();
    }
  }
});
$('view').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.row');
  if (row && !e.target.closest('button')) {
    playRow(row.dataset.id);
  }
});
$('view').addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.row');
  if (row) {
    e.preventDefault();
    trackMenu(row.dataset.id, e.clientX, e.clientY);
  }
});

function playRow(id) {
  if (currentId() === id && S.queue.length > 0) {
    togglePlay();
    return;
  }
  const ids = visibleTracks().map((t) => t.id);
  playContext(ids, id, S.shuffle);
}

// Drag to reorder, attached once to stable containers.
enableSortable($('view'), '#rows .row[draggable="true"]', (from, to) => {
  const p = playlistById(S.view.id);
  if (!p || p.sort !== 'custom') {
    return;
  }
  const shown = visibleTracks().map((t) => t.id);
  const movedId = shown[from];
  const targetId = shown[to];
  const ids = [...p.trackIds];
  const a = ids.indexOf(movedId);
  const b = ids.indexOf(targetId);
  if (a < 0 || b < 0) {
    return;
  }
  ids.splice(a, 1);
  ids.splice(b, 0, movedId);
  p.trackIds = ids;
  savePlaylists();
  renderView();
});
enableSortable($('queuePanel'), '#qrows .qrow', (from, to) => {
  const base = S.index + 1;
  const [moved] = S.queue.splice(base + from, 1);
  S.queue.splice(base + to, 0, moved);
  renderQueue();
});

document.querySelector('.nav').addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    S.view = { type: nav.dataset.nav, id: null };
    renderAll();
  }
});
$('playlistList').addEventListener('click', (e) => {
  const item = e.target.closest('[data-pl]');
  if (item) {
    S.view = { type: 'playlist', id: item.dataset.pl };
    renderAll();
  }
});
$('playlistList').addEventListener('contextmenu', (e) => {
  const item = e.target.closest('[data-pl]');
  if (item) {
    e.preventDefault();
    playlistMenu(item.dataset.pl, e.clientX, e.clientY);
  }
});
$('swatches').addEventListener('click', (e) => {
  const sw = e.target.closest('[data-accent]');
  if (sw) {
    S.accent = sw.dataset.accent;
    saveSkin();
    renderAll();
  }
});
$('newPlaylist').addEventListener('click', () =>
  promptPlaylist('', (name) => {
    const p = { id: plId(), name, trackIds: [], cover: null, sort: 'custom' };
    S.playlists.push(p);
    savePlaylists();
    S.view = { type: 'playlist', id: p.id };
    renderAll();
    if (S.tracks.length > 0) {
      addSongsModal(p.id);
    }
  }),
);
$('search').addEventListener('input', (e) => {
  S.search = e.target.value;
  if (S.view.type === 'playlist') {
    S.view = { type: 'library', id: null };
    renderAll();
  } else {
    renderView();
  }
});
$('librarySort').addEventListener('change', (e) => {
  S.librarySort = e.target.value;
  saveLibrarySettings();
  renderView();
});
$('importBtn').addEventListener('click', async () => {
  const picked = await api.chooseFiles('any');
  void importFiles(picked.map((p) => ({ path: p, name: p.split(/[\\/]/).pop(), mode: 'copy' })));
});
$('openFolder').addEventListener('click', () => void api.openFolder());
$('changeFolder').addEventListener('click', () => void api.chooseFolder());
$('btnPlay').addEventListener('click', togglePlay);
$('btnNext').addEventListener('click', () => next(false));
$('btnPrev').addEventListener('click', previous);
$('btnShuffle').addEventListener('click', toggleShuffle);
$('btnRepeat').addEventListener('click', cycleRepeat);
$('btnQueue').addEventListener('click', () => {
  S.queueOpen = !S.queueOpen;
  renderQueue();
  updatePlayer();
});
$('npLike').addEventListener('click', () => {
  const id = currentId();
  if (id) {
    toggleLike(id);
  }
});

// Dropping files from Windows Explorer onto the window.
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragenter', (e) => {
  if (hasFiles(e)) {
    dragDepth += 1;
    $('dropOverlay').hidden = false;
  }
});
window.addEventListener('dragleave', (e) => {
  if (hasFiles(e)) {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      $('dropOverlay').hidden = true;
    }
  }
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) {
    e.preventDefault();
  }
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) {
    return;
  }
  e.preventDefault();
  dragDepth = 0;
  $('dropOverlay').hidden = true;
  const files = Array.from(e.dataTransfer.files)
    .map((f) => ({ path: api.pathForFile(f), name: f.name, mode: 'copy' }))
    .filter((f) => f.path && (isAudio(f.name) || isImage(f.name)));
  void importFiles(files);
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.code === 'Space' && !typing) {
    e.preventDefault();
    togglePlay();
  }
});

api.onMedia((action) => {
  if (action === 'toggle') {
    togglePlay();
  } else if (action === 'next') {
    next(false);
  } else if (action === 'previous') {
    previous();
  } else if (action === 'stop') {
    audio.pause();
  }
});
api.onFocus(() => {
  refreshIfChanged();
  scanLoose();
});

/* ---------------------------------- Boot ---------------------------------- */

function boot() {
  let vol = 80;
  try {
    const saved = Number(localStorage.getItem('decibel.volume'));
    if (Number.isFinite(saved) && saved > 0) {
      vol = saved;
    }
  } catch {
    // ignore
  }
  audio.volume = vol / 100;
  setRange($('volume'), vol, 100);
  setRange($('seek'), 0, 1000);
  loadFromDisk();
  renderAll();
  scanLoose();
}
boot();
