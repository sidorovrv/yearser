// ============================================================
//  ARTIST SEARCH — floating search overlay for filtering map
// ============================================================

let _searchArtists = [];
let _searchTimeout = null;

function initConcertSearch(artists) {
  // artists is an array of { name, spotifyId, imageUrl, score }
  _searchArtists = artists.sort((a, b) => b.score - a.score);

  const input = document.getElementById('concerts-artist-search');
  const dropdown = document.getElementById('concerts-search-dropdown');
  const clearBtn = document.getElementById('concerts-search-clear');

  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(() => _onSearchInput(input.value.trim()), 300);
  });

  input.addEventListener('focus', () => {
    if (!input.value.trim()) _showAllArtists();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      dropdown.style.display = 'none';
      filterByArtist(null);
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const searchWrap = document.getElementById('concerts-search-wrap');
    if (searchWrap && !searchWrap.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function _onSearchInput(query) {
  const dropdown = document.getElementById('concerts-search-dropdown');
  const clearBtn = document.getElementById('concerts-search-clear');

  if (!query) {
    _showAllArtists();
    if (clearBtn) clearBtn.style.display = 'none';
    filterByArtist(null);
    return;
  }

  if (clearBtn) clearBtn.style.display = 'flex';

  const needle = query.toLowerCase();
  const matches = _searchArtists.filter(a =>
    a.name.toLowerCase().includes(needle)
  ).slice(0, 15);

  _renderDropdown(matches);
}

function _showAllArtists() {
  _renderDropdown(_searchArtists.slice(0, 15));
}

function _renderDropdown(matches) {
  const dropdown = document.getElementById('concerts-search-dropdown');
  if (!dropdown) return;

  if (matches.length === 0) {
    dropdown.innerHTML = '<div class="search-no-results">No matching artists</div>';
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = matches.map(a => {
    const imgHtml = a.imageUrl
      ? `<img class="search-artist-img" src="${a.imageUrl.replace(/"/g, '&quot;')}" alt="" />`
      : `<div class="search-artist-img search-artist-initial">${a.name.charAt(0)}</div>`;
    return `<div class="search-artist-item" data-name="${a.name.replace(/"/g, '&quot;')}">
      ${imgHtml}
      <span class="search-artist-name">${_escHtml(a.name)}</span>
    </div>`;
  }).join('');

  dropdown.style.display = 'block';

  // Wire click handlers
  dropdown.querySelectorAll('.search-artist-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.getAttribute('data-name');
      const input = document.getElementById('concerts-artist-search');
      const clearBtn = document.getElementById('concerts-search-clear');
      if (input) input.value = name;
      if (clearBtn) clearBtn.style.display = 'flex';
      dropdown.style.display = 'none';
      filterByArtist(name);
    });
  });
}

function _escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
