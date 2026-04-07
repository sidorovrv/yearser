// ============================================================
//  CONCERT PREFLIGHT — artist + country selection before scan
// ============================================================

let _pfAffinityMap  = null;
let _pfOnScan       = null;
let _pfExistingCache = null;

/**
 * Show the pre-scan selection screen.
 * @param {Map}            affinityMap    - from fetchListeningHistory()
 * @param {Object|null}    existingCache  - stale cache data (or null) for "use anyway" banner
 * @param {Function}       onScanCallback - called with (filteredMap, selectedCountries)
 */
function initPreflight(affinityMap, existingCache, onScanCallback) {
  _pfAffinityMap   = affinityMap;
  _pfOnScan        = onScanCallback;
  _pfExistingCache = existingCache;

  _pfRenderArtists();
  _pfRenderCountries();
  _pfUpdateFooter();
  _pfRenderCacheBanner(existingCache);

  // Pre-set TTL radio from stored setting
  const ttl = getCacheTtlDays();
  const radio = document.querySelector(`input[name="pf-ttl"][value="${ttl}"]`);
  if (radio) radio.checked = true;

  // Update user badge (may already be set by now)
  const mainName   = document.getElementById('concerts-user-name');
  const mainAvatar = document.getElementById('concerts-user-avatar');
  const pfName     = document.getElementById('pf-user-name');
  const pfAvatar   = document.getElementById('pf-user-avatar');
  if (pfName   && mainName)   pfName.textContent = mainName.textContent;
  if (pfAvatar && mainAvatar) pfAvatar.src        = mainAvatar.src;

  concertGoTo('concerts-preflight');
}

// ── Artist list ── ─────────────────────────────────────────

function _pfRenderArtists() {
  const container = document.getElementById('pf-artists-list');
  if (!container || !_pfAffinityMap) return;

  const artists = [..._pfAffinityMap.values()];

  container.innerHTML = artists.map((a, i) => {
    const checked     = i < 30 ? 'checked' : '';
    const pct         = Math.round(a.score * 100);
    const genres      = a.genres.slice(0, 2)
                          .map(g => `<span class="pf-genre">${_pfEsc(g)}</span>`).join('');
    const popBadge    = a.popularity
                          ? `<span class="pf-stat pf-stat-pop" title="Popularity">★ ${a.popularity}</span>`
                          : '';
    const follBadge   = a.followers
                          ? `<span class="pf-stat" title="Followers">${_pfFmtFollowers(a.followers)}</span>`
                          : '';
    const img         = a.imageUrl
                          ? `<img class="pf-artist-img" src="${a.imageUrl.replace(/"/g, '&quot;')}" alt="" loading="lazy" />`
                          : `<div class="pf-artist-img pf-artist-initial">${_pfEsc(a.name.charAt(0))}</div>`;

    return `<label class="pf-artist-row">
      <input type="checkbox" class="pf-artist-cb" value="${_pfEsc(a.spotifyId)}" ${checked}>
      ${img}
      <div class="pf-artist-body">
        <div class="pf-artist-top">
          <span class="pf-artist-name">${_pfEsc(a.name)}</span>
          <div class="pf-artist-right">${popBadge}${follBadge}</div>
        </div>
        <div class="pf-score-bar"><div class="pf-score-fill" style="width:${pct}%"></div></div>
        <div class="pf-genres">${genres}</div>
      </div>
    </label>`;
  }).join('');

  container.addEventListener('change', _pfUpdateFooter);
}

// ── Artist quick-select ── ─────────────────────────────────

function pfSelectTop(n) {
  document.querySelectorAll('.pf-artist-cb').forEach((cb, i) => { cb.checked = i < n; });
  _pfUpdateFooter();
}

function pfSelectAll(checked) {
  document.querySelectorAll('.pf-artist-cb').forEach(cb => { cb.checked = checked; });
  _pfUpdateFooter();
}

// ── Country list ── ────────────────────────────────────────

function _pfRenderCountries() {
  const container = document.getElementById('pf-countries-list');
  if (!container) return;

  const selected = new Set(getSelectedCountries());
  const sorted   = Object.entries(AVAILABLE_COUNTRIES).sort((a, b) => a[1].localeCompare(b[1]));

  container.innerHTML = sorted.map(([code, name]) =>
    `<label class="settings-check pf-country-check">
      <input type="checkbox" class="pf-country-cb" value="${code}" ${selected.has(code) ? 'checked' : ''}>
      <span>${_pfEsc(name)}</span>
    </label>`
  ).join('');

  container.addEventListener('change', _pfUpdateFooter);
}

function pfPresetCountries(preset) {
  document.querySelectorAll('.pf-country-cb').forEach(cb => {
    if      (preset === 'all')  cb.checked = true;
    else if (preset === 'none') cb.checked = false;
    else if (preset === 'eu')   cb.checked = DEFAULT_CONCERT_COUNTRIES.includes(cb.value);
  });
  _pfUpdateFooter();
}

// ── Footer hint ── ─────────────────────────────────────────

function _pfUpdateFooter() {
  const artistCount  = document.querySelectorAll('.pf-artist-cb:checked').length;
  const countryCount = document.querySelectorAll('.pf-country-cb:checked').length;

  const btn = document.getElementById('pf-scan-btn');
  if (btn) btn.textContent = `Scan Concerts — ${artistCount} artists · ${countryCount} countries`;

  const hint = document.getElementById('pf-req-hint');
  if (hint) hint.textContent = `≈ ${artistCount} API request${artistCount !== 1 ? 's' : ''} (one per artist)`;
}

// ── Cache banner ── ────────────────────────────────────────

function _pfRenderCacheBanner(cache) {
  const banner = document.getElementById('pf-cache-banner');
  if (!banner) return;

  if (cache) {
    const age = cacheAgeLabel(cache.savedAt);
    banner.innerHTML =
      `Cached data available (${age}) — ` +
      `<button class="pf-cache-btn pf-cache-use" onclick="pfUseCachedData()">Use it, skip scan</button> ` +
      `<button class="pf-cache-btn pf-cache-clear" onclick="pfClearBanner()">Dismiss</button>`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function pfUseCachedData() {
  if (_pfExistingCache && _pfAffinityMap) {
    _showConcertMap(_pfExistingCache.events, _pfAffinityMap, cacheAgeLabel(_pfExistingCache.savedAt));
  }
}

function pfClearBanner() {
  clearConcertsCache();
  _pfExistingCache = null;
  const banner = document.getElementById('pf-cache-banner');
  if (banner) banner.style.display = 'none';
}

// ── Scan trigger ── ────────────────────────────────────────

function pfStartScan() {
  const selectedIds = new Set(
    [...document.querySelectorAll('.pf-artist-cb:checked')].map(cb => cb.value)
  );
  const selectedCountries = [...document.querySelectorAll('.pf-country-cb:checked')].map(cb => cb.value);

  if (selectedIds.size === 0) { alert('Please select at least one artist.'); return; }
  if (selectedCountries.length === 0) { alert('Please select at least one country.'); return; }

  // Persist settings (countries + TTL)
  const ttlInput = document.querySelector('input[name="pf-ttl"]:checked');
  const ttlDays  = parseInt(ttlInput?.value || '3', 10);
  saveConcertSettings({ countries: selectedCountries, providers: getSelectedProviders(), ttlDays });

  // Build filtered affinity map (preserves order)
  const filteredMap = new Map();
  for (const [id, artist] of _pfAffinityMap) {
    if (selectedIds.has(id)) filteredMap.set(id, artist);
  }

  if (_pfOnScan) _pfOnScan(filteredMap, selectedCountries);
}

// ── Utils ── ───────────────────────────────────────────────

function _pfEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _pfFmtFollowers(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return Math.round(n / 1_000) + 'K';
  return String(n);
}
