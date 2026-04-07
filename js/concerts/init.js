// ============================================================
//  CONCERTS INIT — entry point for concerts.html
// ============================================================

window.onload = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
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
  const storedToken = localStorage.getItem('timelinefm_token');
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

async function _initConcerts() {
  _concertGoTo('concerts-loading');
  const statusEl = document.getElementById('concerts-status');

  try {
    // Fetch user profile for header
    const me = await spotifyFetch('/me');
    if (!me) return;
    userId = me.id;
    const nameEl = document.getElementById('concerts-user-name');
    const avatarEl = document.getElementById('concerts-user-avatar');
    if (nameEl) nameEl.textContent = me.display_name || me.id;
    if (avatarEl && me.images && me.images[0]) avatarEl.src = me.images[0].url;

    // Load settings
    const countries = getSelectedCountries();
    const providers = getSelectedProviders();
    setActiveProviders(providers);

    // 1. Fetch listening history
    const affinityMap = await fetchListeningHistory((msg) => {
      if (statusEl) statusEl.textContent = msg;
    });

    if (affinityMap.size === 0) {
      _showConcertError('No listening history found. Listen to some music on Spotify first!');
      return;
    }

    // 2. Fetch concert events
    if (statusEl) statusEl.textContent = `Searching concerts in ${countries.length} countries…`;
    const events = await fetchAllEvents(affinityMap, countries, (msg) => {
      if (statusEl) statusEl.textContent = msg;
    });

    // 3. Switch to map screen
    _concertGoTo('concerts-main');

    // 4. Initialize map
    initConcertMap('concerts-map');

    // Small delay to let the DOM render the map container
    requestAnimationFrame(() => {
      invalidateMapSize();
      setConcertEvents(events);

      if (events.length > 0) {
        // 5. Init timeline slider
        initConcertTimeline('concerts-timeline-slider', events);

        // 6. Init search
        initConcertSearch([...affinityMap.values()]);

        // 7. Update stats
        const statsEl = document.getElementById('concerts-stats');
        if (statsEl) {
          const cityCount = new Set(events.map(e => e.city)).size;
          statsEl.textContent = `${events.length} concerts · ${cityCount} cities · ${affinityMap.size} artists`;
        }
      } else {
        const statsEl = document.getElementById('concerts-stats');
        if (statsEl) statsEl.textContent = 'No upcoming concerts found for your artists in the selected countries.';
      }
    });

  } catch (e) {
    console.error('Concerts init error:', e);
    _showConcertError('Something went wrong. Please try again.');
  }
}

function _concertGoTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function _showConcertError(msg) {
  _concertGoTo('concerts-loading');
  const spinner = document.getElementById('concerts-spinner');
  const status = document.getElementById('concerts-status');
  const errorBox = document.getElementById('concerts-error');
  const errorMsg = document.getElementById('concerts-error-msg');
  if (spinner) spinner.style.display = 'none';
  if (status) status.style.display = 'none';
  if (errorBox) errorBox.style.display = 'block';
  if (errorMsg) errorMsg.textContent = msg;
}
