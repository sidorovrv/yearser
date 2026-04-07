// ============================================================
//  PKCE HELPERS
// ============================================================
function base64urlEncode(array) {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(digest));
}

async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('pkce_verifier');
  sessionStorage.removeItem('pkce_verifier');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: HARDCODED_CLIENT_ID,
      code_verifier: verifier
    })
  });
  if (!res.ok) { console.error('Token exchange failed', await res.json().catch(() => ({}))); return null; }
  return res.json();
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('timelinefm_refresh_token');
  if (!refreshToken) return false;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: HARDCODED_CLIENT_ID
    })
  });
  if (!res.ok) return false;
  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  localStorage.setItem('timelinefm_token', accessToken);
  localStorage.setItem('timelinefm_token_expiry', tokenExpiry);
  if (data.refresh_token) localStorage.setItem('timelinefm_refresh_token', data.refresh_token);
  return true;
}

function getClientId() {
  return HARDCODED_CLIENT_ID;
}

async function loginWithSpotify() {
  const clientId = getClientId();
  if (!clientId || clientId === ('__SPOTIFY' + '_CLIENT_ID__')) {
    showError('No Spotify Client ID configured. Please deploy via GitHub Actions with the SPOTIFY_CLIENT_ID secret set.');
    return;
  }
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem('pkce_verifier', verifier);
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', challenge);
  window.location = url.toString();
}

function logout() {
  localStorage.removeItem('timelinefm_token');
  localStorage.removeItem('timelinefm_token_expiry');
  localStorage.removeItem('timelinefm_refresh_token');
  accessToken = null;
  loginWithSpotify();
}

// ============================================================
//  SPOTIFY API HELPERS
// ============================================================
async function spotifyFetch(path, options = {}) {
  const res = await fetch('https://api.spotify.com/v1' + path, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    logout(); return null;
  }
  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    if (err?.error?.message === 'Insufficient client scope') {
      console.warn('Token missing required scopes — forcing re-auth');
      logout(); return null;
    }
    console.warn('Spotify API error', res.status, err);
    return null;
  }
  if (res.status === 204 || res.status === 202) return {};
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.warn('Spotify API error', res.status, err);
    return null;
  }
  return res.json().catch(() => ({}));
}
