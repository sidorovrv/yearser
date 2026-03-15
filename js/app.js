// ============================================================
//  INIT — handle OAuth callback or redirect to Spotify
// ============================================================
window.onload = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (error) {
    showError('Spotify login was cancelled or failed. Please try again.');
    return;
  }

  if (code) {
    window.history.replaceState({}, '', window.location.pathname);
    const tokenData = await exchangeCodeForToken(code);
    if (!tokenData) {
      showError('Failed to complete Spotify login. Please try again.');
      return;
    }
    accessToken = tokenData.access_token;
    tokenExpiry = Date.now() + tokenData.expires_in * 1000;
    localStorage.setItem('timelinefm_token', accessToken);
    localStorage.setItem('timelinefm_token_expiry', tokenExpiry);
    if (tokenData.refresh_token) localStorage.setItem('timelinefm_refresh_token', tokenData.refresh_token);
    await initApp();
    return;
  }

  const storedToken = localStorage.getItem('timelinefm_token');
  const storedExpiry = parseInt(localStorage.getItem('timelinefm_token_expiry') || '0');
  if (storedToken && Date.now() < storedExpiry - 30000) {
    accessToken = storedToken;
    tokenExpiry = storedExpiry;
    await initApp();
    return;
  }

  if (await refreshAccessToken()) {
    await initApp();
    return;
  }

  loginWithSpotify();
};

function showError(msg) {
  goTo('loading');
  document.getElementById('loading-spinner').style.display = 'none';
  document.getElementById('loading-text').style.display = 'none';
  document.getElementById('loading-error').style.display = 'block';
  document.getElementById('loading-error-msg').textContent = msg;
}

// ============================================================
//  APP INIT — fetch user + playlists
// ============================================================
async function initApp() {
  goTo('loading');
  try {
    const me = await spotifyFetch('/me');
    if (!me) return;
    userId = me.id;
    document.getElementById('user-name').textContent = me.display_name || me.id;
    if (me.images && me.images[0]) {
      document.getElementById('user-avatar').src = me.images[0].url;
    }

    await Promise.all([loadPlaylists(), loadRecommendedPlaylists()]);
    renderPlaylistGrid();
    initDevicePlayback();
    goTo('picker');
  } catch(e) {
    console.error(e);
    showError('Failed to connect to Spotify. Please try again.');
  }
}

// ============================================================
//  NAVIGATION
// ============================================================
function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
