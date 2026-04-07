// ============================================================
//  CONCERTS INIT — entry point for concerts.html
// ============================================================

window.onload = async () => {
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const error = params.get('error');

  if (error) {
    _showConcertError('Spotify login was cancelled or failed.');
    return;
  }

  // OAuth callback
  if (code) {
    window.history.replaceState({}, '', window.location.pathname);
    const tokenData = await exchangeCodeForToken(code);
    if (!tokenData) {
      _showConcertError('Failed to complete Spotify login.');
      return;
    }
    accessToken = tokenData.access_token;
    tokenExpiry = Date.now() + tokenData.expires_in * 1000;
    localStorage.setItem('timelinefm_token', accessToken);
    localStorage.setItem('timelinefm_token_expiry', tokenExpiry);
    if (tokenData.refresh_token) localStorage.setItem('timelinefm_refresh_token', tokenData.refresh_token);
    await _initConcerts();
    return;
  }

  // Try stored token
  const storedToken  = localStorage.getItem('timelinefm_token');
  const storedExpiry = parseInt(localStorage.getItem('timelinefm_token_expiry') || '0');
  if (storedToken && Date.now() < storedExpiry - 30000) {
    accessToken = storedToken;
    tokenExpiry = storedExpiry;
    await _initConcerts();
    return;
  }

  // Try refresh
  if (await refreshAccessToken()) {
    await _initConcerts();
    return;
  }

  loginWithSpotify();
};

// ── Main orchestrator ── ───────────────────────────────────

async function _initConcerts() {
  concertGoTo('concerts-loading');
  const statusEl = document.getElementById('concerts-status');

  try {
    // Fetch user profile
    const me = await spotifyFetch('/me');
    if (!me) return;
    userId = me.id;
    _setUserBadge(me.display_name || me.id, me.images?.[0]?.url);

    setActiveProviders(getSelectedProviders());

    // Fetch listening history
    if (statusEl) statusEl.textContent = 'Analyzing your music taste…';
    const affinityMap = await fetchListeningHistory(msg => {
      if (statusEl) statusEl.textContent = msg;
    });

    if (affinityMap.size === 0) {
      _showConcertError('No listening history found. Listen to some music on Spotify first!');
      return;
    }

    const countries     = getSelectedCountries();
    const topArtistIds  = [...affinityMap.keys()];

    // Check for a valid (fresh + fingerprint-matching) cache
    const validCache = loadConcertsCache(countries, topArtistIds, getCacheTtlDays());
    if (validCache) {
      _showConcertMap(validCache.events, affinityMap, cacheAgeLabel(validCache.savedAt));
      return;
    }

    // Check for any stale cache with the same fingerprint (offer "use anyway")
    const staleCache = loadStaleConcertsCache(countries, topArtistIds);

    // Show preflight selection screen
    initPreflight(affinityMap, staleCache || null, async (filteredMap, selectedCountries) => {
      concertGoTo('concerts-loading');
      setActiveProviders(getSelectedProviders());

      if (statusEl) statusEl.textContent = `Scanning ${filteredMap.size} artists…`;
      const events = await fetchAllEvents(filteredMap, selectedCountries, msg => {
        if (statusEl) statusEl.textContent = msg;
      });

      saveConcertsCache(events, selectedCountries, [...filteredMap.keys()]);
      _showConcertMap(events, affinityMap);
    });

  } catch (e) {
    console.error('Concerts init error:', e);
    _showConcertError('Something went wrong. Please try again.');
  }
}

// ── Map display ── ─────────────────────────────────────────

function _showConcertMap(events, affinityMap, cacheAge) {
  concertGoTo('concerts-main');
  initConcertMap('concerts-map');

  requestAnimationFrame(() => {
    invalidateMapSize();
    setConcertEvents(events);

    if (events.length > 0) {
      initConcertTimeline('concerts-timeline-slider', events);
      initConcertSearch([...affinityMap.values()]);
    }

    const statsEl = document.getElementById('concerts-stats');
    if (statsEl) {
      const cities  = new Set(events.map(e => e.city)).size;
      const suffix  = cacheAge ? ` · cached ${cacheAge}` : '';
      const rescan  = `<button class="concerts-rescan-btn" onclick="_rescanConcerts()">↻ Rescan</button>`;
      if (events.length > 0) {
        statsEl.innerHTML = `${events.length} concerts · ${cities} cities · ${affinityMap.size} artists${suffix} ${rescan}`;
      } else {
        statsEl.innerHTML = `No concerts found for your selection${suffix} ${rescan}`;
      }
    }
  });
}

function _rescanConcerts() {
  clearConcertsCache();
  window.location.reload();
}

// ── Helpers ── ─────────────────────────────────────────────

/** Navigate between .screen elements. Called by preflight.js too. */
function concertGoTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function _setUserBadge(name, avatarUrl) {
  ['concerts-user-name', 'pf-user-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = name;
  });
  if (avatarUrl) {
    ['concerts-user-avatar', 'pf-user-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = avatarUrl;
    });
  }
}

function _showConcertError(msg) {
  concertGoTo('concerts-loading');
  const spinner  = document.getElementById('concerts-spinner');
  const status   = document.getElementById('concerts-status');
  const errorBox = document.getElementById('concerts-error');
  const errorMsg = document.getElementById('concerts-error-msg');
  if (spinner)  spinner.style.display  = 'none';
  if (status)   status.style.display   = 'none';
  if (errorBox) errorBox.style.display = 'block';
  if (errorMsg) errorMsg.textContent   = msg;
}
