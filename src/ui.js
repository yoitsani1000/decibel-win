'use strict';

/* The interface. It mirrors the iPhone app: header, filter chips, Liked and Add tiles, rows,
   mini player above a bottom tab bar, a Now Playing sheet and bottom sheets for menus. */

const FILTERS = [
  { key: 'songs', label: 'Songs' },
  { key: 'downloaded', label: 'Downloaded' },
];

/* --------------------------------- Selectors ------------------------------ */

function playlistById(id) {
  return S.playlists.find((p) => p.id === id) || null;
}
function openPlaylist() {
  return S.openPl ? playlistById(S.openPl) : null;
}
function visibleTracks() {
  const p = openPlaylist();
  if (p) {
    const map = byId();
    const members = p.trackIds.map((id) => map.get(id)).filter(Boolean);
    return sortTracks(members, p.sort);
  }
  let base = S.likedOnly ? S.tracks.filter((t) => t.liked) : S.tracks;
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
function memberCount(p) {
  return p.trackIds.filter((id) => trackById(id)).length;
}
function applyAccent() {
  document.documentElement.style.setProperty('--accent', S.accent);
  document.documentElement.style.setProperty('--on-accent', onAccent(S.accent));
}
function scaleColor(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * factor));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* --------------------------------- Rendering ------------------------------ */

function renderHeader() {
  const songs = S.tab === 'songs';
  $('header').innerHTML = `<div class="header-row">
    <div class="header-title">${songs ? 'Your Library' : 'Playlists'}</div>
    <div class="header-actions">
      <button class="icon-btn" data-a="tray" title="Change accent color">${icon(S.trayOpen ? 'color-palette' : 'color-palette-outline', 24)}</button>
      ${S.importing ? '<div class="icon-btn"><div class="spinner"></div></div>' : `<button class="icon-btn" data-a="import" title="Import songs">${icon('add', 30)}</button>`}
    </div></div>`;
  const tray = $('tray');
  tray.classList.toggle('open', S.trayOpen);
  tray.innerHTML = `<div class="tray-row">${ACCENTS.map(
    (a) => `<button class="swatch-wrap" data-accent="${a.color}"><span class="swatch ${a.color === S.accent ? 'on' : ''}" style="background:${a.color}">${a.color === S.accent ? icon('checkmark', 18).replace('fill="currentColor"', `fill="${onAccent(a.color)}"`) : ''}</span><span class="swatch-label ${a.color === S.accent ? 'on' : ''}">${a.label}</span></button>`,
  ).join('')}</div>`;
}

function renderChips() {
  const show = S.tab === 'songs' && !S.openPl;
  $('chips').innerHTML = show
    ? FILTERS.map((f) => `<button class="chip ${S.filter === f.key ? 'on' : ''}" data-chip="${f.key}">${f.label}</button>`).join('')
    : '';
  const showSearch = S.tab === 'songs' && !S.openPl && S.tracks.length > 0;
  $('searchWrap').hidden = !showSearch;
}

function renderTabs() {
  const items = [
    { key: 'songs', label: 'Songs', on: 'musical-notes', off: 'musical-notes-outline' },
    { key: 'playlists', label: 'Playlists', on: 'albums', off: 'albums-outline' },
  ];
  $('tabbar').innerHTML = items
    .map((i) => `<button class="tab ${S.tab === i.key ? 'on' : ''}" data-tab="${i.key}">${icon(S.tab === i.key ? i.on : i.off, 24)}<span>${i.label}</span></button>`)
    .join('');
}

function trackRow(t, i, active, playing) {
  const downloaded = S.filter === 'downloaded' ? icon('arrow-down-circle', 14) : '';
  const vol = active && playing ? icon('volume-high', 14) : '';
  return `<div class="row" data-id="${esc(t.id)}" data-i="${i}">
    ${thumb(t.art, 48, 4)}
    <div class="txt"><div class="title ${active ? 'on' : ''}">${esc(t.title)}</div>
      <div class="subline">${downloaded}${vol}<span>${esc(t.artist)}</span></div></div>
    <button class="more" data-a="more" aria-label="More options">${icon('ellipsis-horizontal', 20)}</button></div>`;
}

function reorderRow(t, i, canUp) {
  return `<div class="row reorder" draggable="true" data-id="${esc(t.id)}" data-i="${i}">
    ${thumb(t.art, 40, 4)}
    <div class="txt"><div class="title">${esc(t.title)}</div><div class="subline"><span>${esc(t.artist)}</span></div></div>
    <button class="icon-btn sm dim" data-a="removeFromPl" title="Remove from playlist">${icon('close', 22)}</button>
    <span class="icon-btn dim" title="Drag to reorder" style="cursor:grab">${icon('reorder-three', 26)}</span></div>`;
}

function playlistHeaderHtml(p, count) {
  const empty = count === 0;
  return `<div class="pl-header">
    <div class="pl-top">
      <button class="icon-btn" data-a="plBack" title="Back to playlists">${icon('chevron-back', 26)}</button>
      <button class="icon-btn" data-a="plMenu" title="Playlist options">${icon('ellipsis-horizontal', 22)}</button>
    </div>
    <div class="pl-cover">${thumb(playlistCover(p), 176, 8)}</div>
    <div class="pl-title">${esc(p.name)}</div>
    <div class="pl-meta">${countLabel(count)}</div>
    <div class="pills">
      <button class="pill" data-a="plAdd">${icon('add', 18)}Add songs</button>
      <button class="pill" data-a="plSort">${icon('swap-vertical', 18)}${SORT_LABELS[p.sort]}</button>
      ${count > 1 ? `<button class="pill ${S.reordering ? 'on' : ''}" data-a="plReorder">${icon(S.reordering ? 'checkmark' : 'reorder-three', 18)}${S.reordering ? 'Done' : 'Reorder'}</button>` : ''}
    </div>
    <div class="play-group">
      <button class="icon-btn" data-a="plShuffle" style="${empty ? 'color:#5A5A5A' : ''}" title="Shuffle play">${icon('shuffle', 26)}</button>
      <button class="play-circle ${empty ? 'disabled' : ''}" data-a="plPlay" title="Play playlist">${icon('play', 28)}</button>
    </div></div>`;
}

function emptyBlock(title, body, button) {
  return `<div class="empty"><h2>${title}</h2><p>${body}</p>${button || ''}</div>`;
}

function renderView() {
  const view = $('view');
  const cur = currentId();
  const playing = !audio.paused;
  const p = openPlaylist();
  let html = '';

  if (S.tab === 'playlists' && !p) {
    html += `<div style="padding-top:4px">
      <div class="row" data-a="newPlaylist"><span class="new-art">${icon('add', 26)}</span><div class="txt"><div class="title">New playlist</div><div class="subline"><span>Sort your songs into a playlist</span></div></div></div>
      <div class="row" data-a="showLiked"><span class="liked-art">${icon('heart', 22)}</span><div class="txt"><div class="title">Liked Songs</div><div class="subline"><span>Playlist &bull; ${countLabel(S.tracks.filter((t) => t.liked).length)}</span></div></div></div></div>`;
    if (S.playlists.length === 0) {
      html += emptyBlock('No playlists yet', 'Tap New playlist above, or open the menu on any song and choose Add to playlist.');
    }
    html += S.playlists
      .map(
        (pl) => `<div class="row" data-pl="${esc(pl.id)}">${thumb(playlistCover(pl), 48, 4)}
        <div class="txt"><div class="title">${esc(pl.name)}</div><div class="subline"><span>Playlist &bull; ${countLabel(memberCount(pl))}</span></div></div>
        <button class="more" data-a="plRowMenu" aria-label="More options">${icon('ellipsis-horizontal', 20)}</button></div>`,
      )
      .join('');
    view.innerHTML = html;
    return;
  }

  const list = visibleTracks();
  if (p) {
    html += playlistHeaderHtml(p, list.length);
    if (list.length === 0) {
      html += emptyBlock('This playlist is empty', 'Add songs from your library to start listening.', '<button class="btn-primary" data-a="plAdd">Add songs</button>');
    } else if (S.reordering) {
      html += `<div id="rows">${list.map((t, i) => reorderRow(t, i)).join('')}</div>`;
    } else {
      html += `<div id="rows">${list.map((t, i) => trackRow(t, i, t.id === cur, playing)).join('')}</div>`;
    }
    view.innerHTML = html;
    return;
  }

  const searching = S.search.trim().length > 0;
  if (S.tracks.length > 1) {
    html += `<button class="sort-row" data-a="libSort">${icon('swap-vertical', 16)}<span>${SORT_LABELS[S.librarySort]}</span></button>`;
  }
  if (S.tab === 'songs' && S.filter === null && !searching) {
    const liked = S.tracks.filter((t) => t.liked).length;
    html += `<div class="grid">
      <button class="tile" data-a="openLiked"><div class="tile-art liked ${S.likedOnly ? 'on' : ''}">${icon('heart', 96)}</div>
        <div class="tile-title ${S.likedOnly ? 'on' : ''}">Liked Songs</div><div class="tile-sub">Playlist &bull; ${countLabel(liked)}</div></button>
      <button class="tile" data-a="import"><div class="tile-art add">${icon('add', 96)}</div>
        <div class="tile-title">Add songs</div><div class="tile-sub">Import from this PC</div></button></div>`;
  }
  if (S.likedOnly) {
    html += '<div class="section-row"><div class="section-title">Liked Songs</div><button class="section-action" data-a="openLiked">Show all</button></div>';
  }
  if (!S.hydrated && false) {
    html += '';
  }
  if (list.length === 0) {
    if (searching) {
      html += emptyBlock('No matches', `Nothing in your songs matches "${esc(S.search.trim())}".`);
    } else if (S.likedOnly) {
      html += emptyBlock('No liked songs yet', 'Tap the heart on any track to save it here.');
    } else {
      html += emptyBlock('Your songs live here', 'Import audio files, or drag them onto this window. You can also copy the Decibel folder over from your iPhone.', '<button class="btn-primary" data-a="import">Import songs</button>');
    }
  } else {
    html += `<div id="rows">${list.map((t, i) => trackRow(t, i, t.id === cur, playing)).join('')}</div>`;
  }
  view.innerHTML = html;
}

function markPlaying() {
  if (S.reordering) {
    return;
  }
  const cur = currentId();
  const playing = !audio.paused;
  document.querySelectorAll('#rows .row').forEach((row) => {
    const active = row.dataset.id === cur;
    const title = row.querySelector('.title');
    if (title) {
      title.classList.toggle('on', active);
    }
    const sub = row.querySelector('.subline');
    if (sub) {
      const existing = sub.querySelector('.vol');
      if (active && playing && !existing) {
        sub.insertAdjacentHTML('afterbegin', `<span class="vol" style="display:inline-flex;color:var(--accent)">${icon('volume-high', 14)}</span>`);
      } else if (existing && !(active && playing)) {
        existing.remove();
      }
    }
  });
}

function renderMini() {
  const t = currentTrack();
  const mini = $('mini');
  $('screen').classList.toggle('has-mini', Boolean(t));
  $('view').classList.toggle('has-mini', Boolean(t));
  if (!t) {
    mini.innerHTML = '';
    return;
  }
  mini.innerHTML = `<div class="mini-capsule" data-a="openNp">
    <div class="mini-progress"><div id="miniFill"></div></div>
    ${thumb(t.art, 40, 6)}
    <div class="mini-text"><div class="mini-title">${esc(t.title)}</div><div class="mini-artist">${esc(t.artist)}</div></div>
    <button class="icon-btn ${t.liked ? '' : ''}" data-a="likeCur" style="${t.liked ? 'color:var(--accent)' : ''}" title="Like">${icon(t.liked ? 'heart' : 'heart-outline', 24)}</button>
    <button class="icon-btn" data-a="toggle" id="miniPlay" title="Play or pause">${icon(audio.paused ? 'play' : 'pause', 28)}</button></div>`;
  onTime();
}

function updatePlayButtons() {
  const mp = $('miniPlay');
  if (mp) {
    mp.innerHTML = icon(audio.paused ? 'play' : 'pause', 28);
  }
  const wheel = $('npPlay');
  if (wheel) {
    wheel.innerHTML = icon(audio.paused ? 'play' : 'pause', 36).replace('class="ico"', `class="ico ${audio.paused ? 'nudge' : ''}"`);
  }
  markPlaying();
}

function onTime() {
  const d = audio.duration;
  const ratio = Number.isFinite(d) && d > 0 ? Math.min(1, audio.currentTime / d) : 0;
  const fill = $('miniFill');
  if (fill) {
    fill.style.width = `${ratio * 100}%`;
  }
  const seek = $('npSeek');
  if (seek && !onTime.scrubbing) {
    seek.value = String(Math.round(ratio * 1000));
    seek.style.setProperty('--fill', `${ratio * 100}%`);
    $('npCur').textContent = fmtTime(audio.currentTime);
  }
  const dur = $('npDur');
  if (dur) {
    dur.textContent = fmtTime(d);
  }
}

function updatePlayer() {
  const t = currentTrack();
  document.title = t ? `${t.title} • ${t.artist}` : 'Decibel';
  renderMini();
  if (S.npOpen) {
    if (t) {
      renderNowPlaying();
    } else {
      closeNowPlaying();
    }
  }
}

function renderAll() {
  applyAccent();
  renderHeader();
  renderChips();
  renderTabs();
  renderView();
  updatePlayer();
  renderSheet();
}

/* ------------------------------- Now Playing ------------------------------ */

function openNowPlaying() {
  if (!currentTrack()) {
    return;
  }
  S.npOpen = true;
  renderNowPlaying();
  requestAnimationFrame(() => {
    const bd = document.querySelector('.np-backdrop');
    if (bd) {
      bd.classList.add('open');
    }
  });
}
function closeNowPlaying() {
  S.npOpen = false;
  S.sheet = null;
  const bd = document.querySelector('.np-backdrop');
  if (bd) {
    bd.classList.remove('open');
    setTimeout(() => {
      if (!S.npOpen) {
        $('npRoot').innerHTML = '';
      }
    }, 300);
  }
  renderSheet();
}

function layoutNp() {
  const area = document.querySelector('.np-art-area');
  const art = area && area.querySelector('.art');
  if (!area || !art) {
    return;
  }
  const size = Math.max(120, Math.min(area.clientWidth - 56, area.clientHeight - 16));
  art.style.width = `${size}px`;
  art.style.height = `${size}px`;
  art.style.borderRadius = '20px';
  const note = art.querySelector('.ico');
  if (note) {
    note.setAttribute('width', String(Math.round(size * 0.3)));
    note.setAttribute('height', String(Math.round(size * 0.3)));
  }
}

function renderNowPlaying() {
  const t = currentTrack();
  if (!t) {
    return;
  }
  const open = Boolean(document.querySelector('.np-backdrop.open'));
  const repeatBadge = S.repeat === 'one' ? '<span class="badge">1</span>' : '';
  $('npRoot').innerHTML = `<div class="np-backdrop ${open ? 'open' : ''}" data-a="npBackdrop">
    <div class="np-sheet" style="background:linear-gradient(to bottom, ${scaleColor(S.accent, 0.55)} 0%, #121212 55%, #000000 100%)">
      <div class="np-top">
        <button class="icon-btn" data-a="closeNp" title="Close player">${icon('chevron-down', 28)}</button>
        <div class="np-top-center"><div class="np-from">PLAYING FROM YOUR LIBRARY</div><div class="np-name">Local Songs</div></div>
        <button class="icon-btn" data-a="npMore" title="More options">${icon('ellipsis-horizontal', 24)}</button>
      </div>
      <div class="np-art-area">${thumb(t.art, 300, 20)}</div>
      <div class="np-info">
        <div class="txt"><div class="np-title">${esc(t.title)}</div><div class="np-artist">${esc(t.artist)}</div></div>
        <button class="icon-btn" data-a="likeCur" style="${t.liked ? 'color:var(--accent)' : ''}" title="Like">${icon(t.liked ? 'heart' : 'heart-outline', 28)}</button>
      </div>
      <div class="np-slider"><input type="range" id="npSeek" min="0" max="1000" value="0" aria-label="Playback position">
        <div class="np-times"><span id="npCur">0:00</span><span id="npDur">0:00</span></div></div>
      <div class="np-controls">
        <button class="slot ${S.shuffle ? 'on' : ''}" data-a="shuffle" title="Shuffle">${icon('shuffle', 26)}${S.shuffle ? '<span class="dot"></span>' : ''}</button>
        <button class="icon-btn" data-a="prev" title="Previous">${icon('play-skip-back', 34)}</button>
        <button class="play-wheel" data-a="toggle" id="npPlay" title="Play or pause">${icon(audio.paused ? 'play' : 'pause', 36).replace('class="ico"', `class="ico ${audio.paused ? 'nudge' : ''}"`)}</button>
        <button class="icon-btn" data-a="next" title="Next">${icon('play-skip-forward', 34)}</button>
        <button class="slot ${S.repeat !== 'off' ? 'on' : ''}" data-a="repeat" title="Repeat">${icon('repeat', 26)}${repeatBadge}${S.repeat !== 'off' ? '<span class="dot"></span>' : ''}</button>
      </div>
      <div class="np-footer"><button class="icon-btn" data-a="openQueue" title="Queue" style="color:var(--text2)">${icon('list', 24)}</button></div>
    </div></div>`;
  layoutNp();
  onTime();
  const seek = $('npSeek');
  seek.addEventListener('input', () => {
    onTime.scrubbing = true;
    const v = Number(seek.value);
    seek.style.setProperty('--fill', `${v / 10}%`);
    if (Number.isFinite(audio.duration)) {
      $('npCur').textContent = fmtTime((v / 1000) * audio.duration);
    }
  });
  seek.addEventListener('change', () => {
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    }
    onTime.scrubbing = false;
  });
}
window.addEventListener('resize', layoutNp);

/* ---------------------------------- Sheets -------------------------------- */

function sheet(inner) {
  return `<div class="backdrop" data-a="sheetBackdrop"><div class="sheet">${inner}</div></div>`;
}
function optRow(action, iconName, label, extra = '') {
  return `<button class="opt" data-a="${action}" ${extra}>${icon(iconName, 24)}<span>${esc(label)}</span></button>`;
}
function selRow(id, art, title, sub, checked, action) {
  return `<button class="sel" data-a="${action}" data-id="${esc(id)}">${thumb(art, 40, 4)}<div class="txt"><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div><span class="check ${checked ? 'on' : ''}">${checked ? icon('checkmark', 16) : ''}</span></button>`;
}

function renderSheet() {
  const root = $('sheetRoot');
  const sh = S.sheet;
  S.queueOpen = Boolean(sh && sh.type === 'queue');
  if (!sh) {
    root.innerHTML = '';
    return;
  }
  let html = '';
  if (sh.type === 'options') {
    const t = trackById(sh.trackId);
    if (!t) {
      S.sheet = null;
      root.innerHTML = '';
      return;
    }
    const head = `<div class="sheet-head">${thumb(t.art, 40, 4)}<div><div class="t">${esc(t.title)}</div><div class="a">${esc(t.artist)}${t.album ? ` • ${esc(t.album)}` : ''}</div></div></div>`;
    if (sh.mode === 'menu') {
      const pl = openPlaylist();
      const inPl = pl && !S.npOpen && pl.trackIds.includes(t.id);
      html = sheet(`${head}<div class="sheet-scroll">
        ${optRow('o-like', t.liked ? 'heart-dislike-outline' : 'heart-outline', t.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs')}
        ${optRow('o-next', 'play-forward-outline', 'Play next')}
        ${optRow('o-queue', 'list-outline', 'Add to queue')}
        ${optRow('o-playlists', 'add-circle-outline', 'Add to playlist')}
        ${inPl ? optRow('o-removepl', 'remove-circle-outline', `Remove from ${pl.name}`) : ''}
        ${optRow('o-edit', 'create-outline', 'Edit details')}
        ${optRow('o-art', 'image-outline', 'Choose artwork')}
        ${optRow('o-remove', 'trash-outline', 'Remove from library')}</div>`);
    } else if (sh.mode === 'edit') {
      html = sheet(`${head}<div class="form">
        <label>Title</label><input type="text" id="fTitle" value="${esc(t.title)}">
        <label>Artist</label><input type="text" id="fArtist" value="${esc(t.artist)}">
        <label>Album</label><input type="text" id="fAlbum" value="${esc(t.album)}" placeholder="${DEFAULT_ALBUM}"></div>
        <div class="actions"><button class="btn-secondary" data-a="o-back">Cancel</button><button class="btn-primary" data-a="o-save">Save</button></div>`);
    } else if (sh.mode === 'playlists') {
      html = sheet(`${head}${optRow('o-newpl', 'add', 'New playlist')}
        ${S.playlists.length === 0 ? '<div class="hint">No playlists yet. Create one to start sorting your songs.</div>' : `<div class="sheet-scroll" style="max-height:260px">${S.playlists.map((p) => selRow(p.id, playlistCover(p), p.name, countLabel(memberCount(p)), p.trackIds.includes(t.id), 'o-togglepl')).join('')}</div>`}
        <div class="actions"><button class="btn-primary" data-a="o-done">Done</button></div>`);
    } else {
      html = sheet(`<div class="sheet-title">New playlist</div><div class="form"><label>Name</label><input type="text" id="fName" maxlength="60" placeholder="My playlist"></div>
        <div class="actions"><button class="btn-secondary" data-a="o-back">Cancel</button><button class="btn-primary" data-a="o-createpl">Create</button></div>`);
    }
  } else if (sh.type === 'sort') {
    const opts = sh.scope === 'library' ? LIBRARY_SORTS : PLAYLIST_SORTS;
    const value = sh.scope === 'library' ? S.librarySort : (openPlaylist() || {}).sort;
    html = sheet(`<div class="sheet-title">${sh.scope === 'library' ? 'Sort songs by' : 'Sort playlist by'}</div>
      ${opts.map((k) => `<button class="opt ${k === value ? 'on' : ''}" data-a="s-pick" data-key="${k}"><span class="grow">${SORT_LABELS[k]}</span>${k === value ? icon('checkmark', 22) : ''}</button>`).join('')}`);
  } else if (sh.type === 'plMenu') {
    const p = playlistById(sh.id);
    if (!p) {
      S.sheet = null;
      root.innerHTML = '';
      return;
    }
    html = sheet(`<div class="sheet-title">${esc(p.name)}</div>
      ${optRow('p-add', 'add-circle-outline', 'Add songs')}
      ${optRow('p-rename', 'create-outline', 'Rename')}
      ${optRow('p-cover', 'image-outline', 'Change cover')}
      ${p.cover ? optRow('p-nocover', 'close', 'Remove cover') : ''}
      ${optRow('p-delete', 'trash-outline', 'Delete playlist')}`);
  } else if (sh.type === 'plName') {
    const p = sh.id ? playlistById(sh.id) : null;
    html = sheet(`<div class="sheet-title">${p ? 'Rename playlist' : 'New playlist'}</div><div class="form"><label>Name</label><input type="text" id="fName" maxlength="60" value="${esc(p ? p.name : '')}" placeholder="My playlist"></div>
      <div class="actions"><button class="btn-secondary" data-a="close">Cancel</button><button class="btn-primary" data-a="p-savename">${p ? 'Save' : 'Create'}</button></div>`);
  } else if (sh.type === 'addSongs') {
    const p = playlistById(sh.id);
    if (!p) {
      S.sheet = null;
      root.innerHTML = '';
      return;
    }
    const needle = (sh.query || '').trim().toLowerCase();
    const rows = S.tracks
      .filter((t) => !needle || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(needle))
      .map((t) => selRow(t.id, t.art, t.title, t.artist, sh.selected.has(t.id), 'a-toggle'))
      .join('');
    html = sheet(`<div class="sheet-title">Add songs to ${esc(p.name)}</div>
      <div class="search-bar"><span>${icon('search', 18)}</span><input id="aSearch" type="text" placeholder="Search your songs" value="${esc(sh.query || '')}" autocomplete="off"></div>
      <div class="sheet-scroll" style="max-height:380px">${rows || '<div class="hint">No songs match.</div>'}</div>
      <div class="actions"><button class="btn-secondary" data-a="close">Cancel</button><button class="btn-primary" data-a="a-save">Save</button></div>`);
  } else if (sh.type === 'queue') {
    const cur = currentTrack();
    const upcoming = S.index >= 0 ? S.queue.slice(S.index + 1) : [];
    html = sheet(`<div class="qhead"><div class="sheet-title" style="padding:0">Queue</div>
      <div style="display:flex;gap:8px"><button class="pill" data-a="q-shuffle">Shuffle next</button><button class="pill" data-a="q-clear">Clear</button></div></div>
      <div class="sheet-scroll" style="max-height:60vh">
      ${cur ? `<div class="qlabel">NOW PLAYING</div><div class="qrow now">${thumb(cur.art, 40, 4)}<div class="txt"><div class="title">${esc(cur.title)}</div><div class="artist">${esc(cur.artist)}</div></div></div>` : ''}
      <div class="qlabel">NEXT UP</div><div id="qrows">
      ${upcoming.length === 0 ? '<div class="hint">Nothing queued. Use Play next or Add to queue on any song.</div>' : ''}
      ${upcoming
        .map((id, i) => {
          const t = trackById(id);
          return t
            ? `<div class="qrow" draggable="true" data-i="${i}" data-id="${esc(id)}"><span class="grip">${icon('reorder-three', 24)}</span>${thumb(t.art, 40, 4)}<div class="txt" data-a="q-jump"><div class="title">${esc(t.title)}</div><div class="artist">${esc(t.artist)}</div></div><button class="icon-btn sm dim" data-a="q-remove" title="Remove">${icon('close', 22)}</button></div>`
            : '';
        })
        .join('')}</div></div>`);
  }
  root.innerHTML = html;
  const input = root.querySelector('#fTitle, #fName, #aSearch');
  if (input && !sh.focused) {
    sh.focused = true;
    input.focus();
    input.select();
  }
}
function renderQueue() {
  if (S.sheet && S.sheet.type === 'queue') {
    renderSheet();
  }
}
function openSheet(sh) {
  S.sheet = sh;
  renderSheet();
}
function closeSheet() {
  S.sheet = null;
  renderSheet();
}

/* --------------------------------- Actions -------------------------------- */

function toggleLike(id) {
  const t = trackById(id);
  if (!t) {
    return;
  }
  t.liked = !t.liked;
  saveTracks();
  renderAll();
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

function createPlaylist(name, firstId) {
  const p = { id: plId(), name: name.trim().slice(0, 60) || `Playlist ${S.playlists.length + 1}`, trackIds: firstId ? [firstId] : [], cover: null, sort: 'custom' };
  S.playlists.push(p);
  savePlaylists();
  return p;
}

function showPlaylist(id) {
  S.likedOnly = false;
  S.tab = 'playlists';
  S.openPl = id;
  S.reordering = false;
  renderAll();
}

function toggleReorder() {
  const p = openPlaylist();
  if (!p) {
    return;
  }
  if (!S.reordering) {
    p.sort = 'custom';
    savePlaylists();
  }
  S.reordering = !S.reordering;
  renderAll();
}

function playRow(id) {
  if (currentId() === id && S.queue.length > 0) {
    togglePlay();
    return;
  }
  const ids = visibleTracks().map((t) => t.id);
  playContext(ids, id, S.shuffle);
}

function setSheetValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function handleAction(action, target, event) {
  const sh = S.sheet;
  const row = target.closest('[data-id]');
  const rowId = row ? row.dataset.id : null;
  switch (action) {
    case 'tray':
      S.trayOpen = !S.trayOpen;
      renderHeader();
      return;
    case 'import':
      void (async () => {
        const picked = await api.chooseFiles('any');
        void importFiles(picked.map((p) => ({ path: p, name: p.split(/[\\/]/).pop(), mode: 'copy' })));
      })();
      return;
    case 'libSort':
      openSheet({ type: 'sort', scope: 'library' });
      return;
    case 'openLiked':
      S.openPl = null;
      S.filter = null;
      S.likedOnly = !S.likedOnly;
      renderAll();
      return;
    case 'showLiked':
      S.tab = 'songs';
      S.openPl = null;
      S.filter = null;
      S.likedOnly = true;
      renderAll();
      return;
    case 'newPlaylist':
      openSheet({ type: 'plName', id: null });
      return;
    case 'more':
      openSheet({ type: 'options', trackId: rowId, mode: 'menu' });
      return;
    case 'plRowMenu': {
      const pl = target.closest('[data-pl]');
      if (pl) {
        openSheet({ type: 'plMenu', id: pl.dataset.pl });
      }
      return;
    }
    case 'removeFromPl': {
      const p = openPlaylist();
      if (p && rowId) {
        p.trackIds = p.trackIds.filter((x) => x !== rowId);
        savePlaylists();
        renderAll();
      }
      return;
    }
    case 'plBack':
      S.openPl = null;
      S.reordering = false;
      renderAll();
      return;
    case 'plMenu':
      openSheet({ type: 'plMenu', id: S.openPl });
      return;
    case 'plAdd': {
      const p = openPlaylist();
      if (p) {
        openSheet({ type: 'addSongs', id: p.id, selected: new Set(p.trackIds), query: '' });
      }
      return;
    }
    case 'plSort':
      openSheet({ type: 'sort', scope: 'playlist' });
      return;
    case 'plReorder':
      toggleReorder();
      return;
    case 'plPlay': {
      const ids = visibleTracks().map((t) => t.id);
      playContext(ids, ids[0], false);
      return;
    }
    case 'plShuffle': {
      const ids = visibleTracks().map((t) => t.id);
      playContext(ids, null, true);
      return;
    }
    case 'openNp':
      openNowPlaying();
      return;
    case 'closeNp':
      closeNowPlaying();
      return;
    case 'npBackdrop':
      if (event.target === target) {
        closeNowPlaying();
      }
      return;
    case 'npMore': {
      const id = currentId();
      if (id) {
        openSheet({ type: 'options', trackId: id, mode: 'menu' });
      }
      return;
    }
    case 'likeCur': {
      const id = currentId();
      if (id) {
        toggleLike(id);
      }
      return;
    }
    case 'toggle':
      togglePlay();
      return;
    case 'prev':
      previous();
      return;
    case 'next':
      next(false);
      return;
    case 'shuffle':
      toggleShuffle();
      renderNowPlaying();
      return;
    case 'repeat':
      cycleRepeat();
      renderNowPlaying();
      return;
    case 'openQueue':
      openSheet({ type: 'queue' });
      return;
    case 'sheetBackdrop':
      if (event.target === target) {
        closeSheet();
      }
      return;
    case 'close':
      closeSheet();
      return;
    default:
      break;
  }
  if (!sh) {
    return;
  }

  // Sheet actions
  const trackId = sh.trackId;
  switch (action) {
    case 'o-like':
      closeSheet();
      toggleLike(trackId);
      break;
    case 'o-next':
      closeSheet();
      enqueue(trackId, true);
      break;
    case 'o-queue':
      closeSheet();
      enqueue(trackId, false);
      break;
    case 'o-playlists':
      sh.mode = 'playlists';
      renderSheet();
      break;
    case 'o-removepl': {
      const p = openPlaylist();
      closeSheet();
      if (p) {
        p.trackIds = p.trackIds.filter((x) => x !== trackId);
        savePlaylists();
        renderAll();
      }
      break;
    }
    case 'o-edit':
      sh.mode = 'edit';
      sh.focused = false;
      renderSheet();
      break;
    case 'o-art':
      closeSheet();
      void chooseArtworkFor(trackId);
      break;
    case 'o-remove': {
      const t = trackById(trackId);
      closeSheet();
      if (t && window.confirm(`"${t.title}" will be deleted from this computer's Decibel folder.`)) {
        removeTrack(trackId);
      }
      break;
    }
    case 'o-back':
      sh.mode = 'menu';
      renderSheet();
      break;
    case 'o-done':
      closeSheet();
      break;
    case 'o-save': {
      const t = trackById(trackId);
      if (t) {
        t.title = setSheetValue('fTitle').trim() || t.title;
        t.artist = setSheetValue('fArtist').trim() || DEFAULT_ARTIST;
        t.album = setSheetValue('fAlbum').trim();
        saveTracks();
      }
      closeSheet();
      renderAll();
      break;
    }
    case 'o-togglepl': {
      const p = playlistById(rowId);
      if (p) {
        p.trackIds = p.trackIds.includes(trackId) ? p.trackIds.filter((x) => x !== trackId) : [...p.trackIds, trackId];
        savePlaylists();
        renderSheet();
        renderView();
      }
      break;
    }
    case 'o-newpl':
      sh.mode = 'newPlaylist';
      sh.focused = false;
      renderSheet();
      break;
    case 'o-createpl': {
      const p = createPlaylist(setSheetValue('fName'), trackId);
      closeSheet();
      toast(`Added to ${p.name}`);
      renderAll();
      break;
    }
    case 's-pick': {
      const key = target.dataset.key;
      if (sh.scope === 'library') {
        S.librarySort = key;
        saveLibrarySettings();
      } else {
        const p = openPlaylist();
        if (p) {
          p.sort = key;
          savePlaylists();
        }
      }
      closeSheet();
      renderAll();
      break;
    }
    case 'p-add': {
      const p = playlistById(sh.id);
      if (p) {
        openSheet({ type: 'addSongs', id: p.id, selected: new Set(p.trackIds), query: '' });
      }
      break;
    }
    case 'p-rename':
      openSheet({ type: 'plName', id: sh.id });
      break;
    case 'p-cover': {
      const id = sh.id;
      closeSheet();
      void setPlaylistCover(id);
      break;
    }
    case 'p-nocover': {
      const p = playlistById(sh.id);
      closeSheet();
      if (p && p.cover) {
        api.remove(p.cover);
        p.cover = null;
        savePlaylists();
        renderAll();
      }
      break;
    }
    case 'p-delete': {
      const p = playlistById(sh.id);
      closeSheet();
      if (p && window.confirm(`"${p.name}" will be deleted. Your songs stay in the library.`)) {
        if (p.cover) {
          api.remove(p.cover);
        }
        S.playlists = S.playlists.filter((x) => x.id !== p.id);
        if (S.openPl === p.id) {
          S.openPl = null;
        }
        savePlaylists();
        renderAll();
      }
      break;
    }
    case 'p-savename': {
      const name = setSheetValue('fName');
      if (sh.id) {
        const p = playlistById(sh.id);
        if (p && name.trim()) {
          p.name = name.trim().slice(0, 60);
          savePlaylists();
        }
        closeSheet();
        renderAll();
      } else {
        const p = createPlaylist(name, null);
        closeSheet();
        showPlaylist(p.id);
        if (S.tracks.length > 0) {
          openSheet({ type: 'addSongs', id: p.id, selected: new Set(), query: '' });
        }
      }
      break;
    }
    case 'a-toggle':
      if (sh.selected.has(rowId)) {
        sh.selected.delete(rowId);
      } else {
        sh.selected.add(rowId);
      }
      sh.focused = true;
      renderSheet();
      break;
    case 'a-save': {
      const p = playlistById(sh.id);
      if (p) {
        const kept = p.trackIds.filter((id) => sh.selected.has(id) || !trackById(id));
        const keptSet = new Set(kept);
        const added = S.tracks.map((t) => t.id).filter((id) => sh.selected.has(id) && !keptSet.has(id));
        p.trackIds = [...kept, ...added];
        savePlaylists();
      }
      closeSheet();
      renderAll();
      break;
    }
    case 'q-shuffle':
      if (S.index >= 0) {
        S.queue = [...S.queue.slice(0, S.index + 1), ...shuffled(S.queue.slice(S.index + 1))];
      }
      renderSheet();
      break;
    case 'q-clear':
      if (S.index >= 0) {
        S.queue = S.queue.slice(0, S.index + 1);
      }
      renderSheet();
      break;
    case 'q-jump': {
      const qrow = target.closest('.qrow');
      if (qrow) {
        playAt(S.index + 1 + Number(qrow.dataset.i));
        renderSheet();
      }
      break;
    }
    case 'q-remove': {
      const qrow = target.closest('.qrow');
      if (qrow) {
        S.queue.splice(S.index + 1 + Number(qrow.dataset.i), 1);
        renderSheet();
      }
      break;
    }
    default:
      break;
  }
}

/* ---------------------------------- Events -------------------------------- */

document.addEventListener('click', (e) => {
  const accent = e.target.closest('[data-accent]');
  if (accent) {
    S.accent = accent.dataset.accent;
    saveSkin();
    renderAll();
    return;
  }
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    S.likedOnly = false;
    S.filter = S.filter === chip.dataset.chip ? null : chip.dataset.chip;
    renderAll();
    return;
  }
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    const next = tab.dataset.tab;
    if (S.tab === next && S.openPl) {
      S.openPl = null;
    }
    S.tab = next;
    S.openPl = null;
    S.reordering = false;
    S.likedOnly = false;
    renderAll();
    return;
  }
  const actionEl = e.target.closest('[data-a]');
  if (actionEl) {
    handleAction(actionEl.dataset.a, actionEl, e);
    return;
  }
  const plRow = e.target.closest('[data-pl]');
  if (plRow) {
    showPlaylist(plRow.dataset.pl);
    return;
  }
  const row = e.target.closest('#rows .row');
  if (row && !S.reordering) {
    playRow(row.dataset.id);
  }
});

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#rows .row');
  if (row && !S.reordering) {
    e.preventDefault();
    openSheet({ type: 'options', trackId: row.dataset.id, mode: 'menu' });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    S.search = e.target.value;
    $('searchClear').hidden = S.search.length === 0;
    renderView();
  } else if (e.target.id === 'aSearch' && S.sheet && S.sheet.type === 'addSongs') {
    S.sheet.query = e.target.value;
    const pos = e.target.selectionStart;
    S.sheet.focused = true;
    renderSheet();
    const again = document.getElementById('aSearch');
    if (again) {
      again.focus();
      again.setSelectionRange(pos, pos);
    }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && S.sheet) {
    if (S.sheet.type === 'plName') {
      handleAction('p-savename', document.body, e);
    } else if (S.sheet.type === 'options' && S.sheet.mode === 'edit') {
      handleAction('o-save', document.body, e);
    } else if (S.sheet.type === 'options' && S.sheet.mode === 'newPlaylist') {
      handleAction('o-createpl', document.body, e);
    }
  }
  if (e.key === 'Escape') {
    if (S.sheet) {
      closeSheet();
    } else if (S.npOpen) {
      closeNowPlaying();
    }
  }
  const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
  if (e.code === 'Space' && !typing) {
    e.preventDefault();
    togglePlay();
  }
});
$('searchClear').addEventListener('click', () => {
  S.search = '';
  $('search').value = '';
  $('searchClear').hidden = true;
  renderView();
});

// Drag to reorder: playlist rows in Reorder mode and the queue.
function enableSortable(container, rowSelector, onMove) {
  let from = -1;
  let over = null;
  const clear = () => container.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest && e.target.closest(rowSelector);
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
enableSortable($('view'), '#rows .row.reorder', (from, to) => {
  const p = openPlaylist();
  if (!p) {
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
enableSortable($('sheetRoot'), '#qrows .qrow', (from, to) => {
  const base = S.index + 1;
  const [moved] = S.queue.splice(base + from, 1);
  S.queue.splice(base + to, 0, moved);
  renderSheet();
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

$('searchIcon').innerHTML = icon('search', 18);
$('searchClear').innerHTML = icon('close-circle', 18);
loadFromDisk();
renderAll();
scanLoose();
