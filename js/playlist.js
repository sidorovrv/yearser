// ============================================================
//  PLAYLIST LOADING & RENDERING
// ============================================================
async function loadPlaylists() {
  let allPlaylists = [];
  let url = '/me/playlists?limit=50';
  while (url) {
    const data = await spotifyFetch(url.startsWith('/') ? url : url.replace('https://api.spotify.com/v1', ''));
    if (!data) break;
    allPlaylists = allPlaylists.concat(data.items || []);
    url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
  }
  playlists = allPlaylists.filter(p => p && p.tracks && p.tracks.total > 0);
  // Prepend Liked Songs as a virtual playlist
  const likedData = await spotifyFetch('/me/tracks?limit=1');
  if (likedData && typeof likedData.total === 'number' && likedData.total > 0) {
    playlists.unshift({ id: '__liked__', name: '♥ Liked Songs', images: [], tracks: { total: likedData.total } });
  }
}

function playlistCardHtml(pl) {
  const img = pl.images && pl.images[0] ? pl.images[0].url : null;
  const icon = pl.id === '__liked__' ? '♥' : '♪';
  const imgEl = img
    ? `<img class="pl-img" src="${img}" alt="" loading="lazy">`
    : `<div class="pl-img-placeholder">${icon}</div>`;
  const total = pl.tracks ? pl.tracks.total : '?';
  return `<div class="pl-card ${selectedPlaylistId === pl.id ? 'selected' : ''}" data-id="${pl.id}" data-name="${escHtml(pl.name)}" onclick="selectPlaylist(this.dataset.id,this.dataset.name)">${imgEl}<div class="pl-info"><div class="pl-name">${escHtml(pl.name)}</div><div class="pl-count">${total} tracks</div></div></div>`;
}

function renderPlaylistGrid(searchResults = null) {
  const grid = document.getElementById('playlist-grid');
  if (searchResults !== null) {
    if (!searchResults.length) { grid.innerHTML = '<div class="empty-state">No playlists found.</div>'; return; }
    grid.innerHTML = '<div class="pl-section-label">Search Results</div>' + searchResults.map(playlistCardHtml).join('');
    return;
  }
  let html = '';
  if (recommendedPlaylists.length) {
    html += '<div class="pl-section-label">Recommended</div>' + recommendedPlaylists.map(playlistCardHtml).join('');
  }
  if (playlists.length) {
    html += '<div class="pl-section-label" style="padding-top:16px">My Playlists</div>' + playlists.map(playlistCardHtml).join('');
  }
  grid.innerHTML = html || '<div class="empty-state">No playlists found on your account.</div>';
  if (!selectedPlaylistId && playlists.length) selectPlaylist(playlists[0].id, playlists[0].name);
}

function selectPlaylist(id, name) {
  selectedPlaylistId = id;
  selectedPlaylistName = name;
  document.querySelectorAll('.pl-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === id);
  });
}

// ============================================================
//  PLAYLIST SEARCH & RECOMMENDED
// ============================================================
function onSearchInput(val) {
  clearTimeout(searchTimeout);
  const v = val.trim();
  if (!v) { renderPlaylistGrid(); return; }
  searchTimeout = setTimeout(() => searchPlaylists(v), 380);
}

async function searchPlaylists(query) {
  const grid = document.getElementById('playlist-grid');
  grid.innerHTML = '<div class="empty-state">Searching…</div>';
  const data = await spotifyFetch(`/search?type=playlist&q=${encodeURIComponent(query)}&limit=16`);
  if (!data || !data.playlists) { grid.innerHTML = '<div class="empty-state">No results found.</div>'; return; }
  renderPlaylistGrid((data.playlists.items || []).filter(p => p && p.tracks && p.tracks.total > 0));
}

async function loadRecommendedPlaylists() {
  // Public playlist IDs to pin in the Recommended section.
  // Any publicly shared Spotify playlist URL works — paste the ID here.
  const ids = [
    '4oYTRg0JI48jucsJOLily1', // Time Rock
    '3r4Rx7OnTGfIM4Cboxnv7p', // Time Pop US
  ];

  const results = await Promise.all(
    ids.map(id => spotifyFetch(`/playlists/${id}?fields=id,name,images,tracks(total)`).catch(() => null))
  );
  recommendedPlaylists = results.filter(p => p && p.id);
}
