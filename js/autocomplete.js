// ============================================================
//  ARTIST / TITLE AUTOCOMPLETE
// ============================================================
function onAcInput(type, val) {
  if (type === 'artist') pendingArtistGuess = val;
  else pendingTitleGuess = val;
  clearTimeout(acTimers[type]);
  const dropId = type === 'artist' ? 'ac-artist-drop' : 'ac-title-drop';
  if (!val.trim()) { const d = document.getElementById(dropId); if (d) d.style.display = 'none'; return; }
  if (val.trim().length < 3) return;
  acTimers[type] = setTimeout(() => acSearch(type, val.trim()), 160);
}

async function acSearch(type, query) {
  const dropId = type === 'artist' ? 'ac-artist-drop' : 'ac-title-drop';
  const drop = document.getElementById(dropId);
  if (!drop) return;
  const data = await spotifyFetch(`/search?type=${type === 'artist' ? 'artist' : 'track'}&q=${encodeURIComponent(query)}&limit=12`);
  if (!data) return;
  const items = type === 'artist'
    ? (data.artists ? data.artists.items : [])
    : (data.tracks ? data.tracks.items : []);
  if (!items || !items.length) { drop.style.display = 'none'; return; }
  const seen = new Set();
  const q = query.toLowerCase();
  const deduped = items.filter(item => {
    const key = item.name.toLowerCase();
    if (!key.includes(q)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  drop.innerHTML = deduped.slice(0, 6).map(item =>
    `<div class="ac-item" data-type="${type}" data-value="${escHtml(item.name)}" onclick="selectAcFromEl(this)">${escHtml(item.name)}</div>`
  ).join('');
  drop.style.display = 'block';
}

function selectAcFromEl(el) {
  const type = el.dataset.type;
  const value = el.dataset.value;
  if (type === 'artist') {
    pendingArtistGuess = value;
    const inp = document.getElementById('ac-artist');
    if (inp) inp.value = value;
    document.getElementById('ac-artist-drop').style.display = 'none';
  } else {
    pendingTitleGuess = value;
    const inp = document.getElementById('ac-title');
    if (inp) inp.value = value;
    document.getElementById('ac-title-drop').style.display = 'none';
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.ac-wrap')) {
    document.querySelectorAll('.ac-dropdown').forEach(d => d.style.display = 'none');
  }
});
