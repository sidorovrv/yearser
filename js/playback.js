// ============================================================
//  PLAYBACK — Web Playback SDK on desktop, REST API on iOS
// ============================================================
function initDevicePlayback() {
  if (isIOS) {
    // iOS Safari: use Spotify Connect REST API (requires Spotify app open)
    refreshDevices();
  } else {
    // Desktop: load Web Playback SDK (creates virtual device in browser)
    loadSpotifySDK();
    const btn = document.getElementById('refresh-devices-btn');
    if (btn) btn.style.display = 'none';
  }
}

function loadSpotifySDK() {
  const statusEl = document.getElementById('player-status');
  if (statusEl) statusEl.textContent = 'Loading player…';
  window.onSpotifyWebPlaybackSDKReady = () => {
    spotifyPlayer = new Spotify.Player({
      name: 'Timeline FM',
      getOAuthToken: cb => cb(accessToken),
      volume: 0.8
    });
    spotifyPlayer.addListener('ready', ({ device_id }) => {
      deviceId = device_id;
      const s = document.getElementById('player-status');
      if (s) s.textContent = '▶ Ready';
    });
    spotifyPlayer.addListener('not_ready', () => {
      deviceId = null;
      const s = document.getElementById('player-status');
      if (s) s.textContent = 'Player disconnected — reload page';
    });
    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('SDK init:', message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('SDK auth:', message));
    spotifyPlayer.addListener('account_error', () => {
      const s = document.getElementById('player-status');
      if (s) s.textContent = 'Spotify Premium required';
    });
    spotifyPlayer.connect();
  };
  const script = document.createElement('script');
  script.src = 'https://sdk.scdn.co/spotify-player.js';
  document.head.appendChild(script);
}

async function refreshDevices() {
  const statusEl = document.getElementById('player-status');
  if (statusEl) statusEl.textContent = 'Looking for Spotify…';
  const data = await spotifyFetch('/me/player/devices');
  if (!data || !data.devices || !data.devices.length) {
    deviceId = null;
    if (statusEl) statusEl.textContent = 'No devices found';
    return null;
  }
  // Prefer active device; fall back to first available
  const active = data.devices.find(d => d.is_active) || data.devices[0];
  deviceId = active.id;
  if (statusEl) statusEl.textContent = (active.is_active ? '▶ ' : '📱 ') + active.name;
  hideNoDeviceBanner();
  return active;
}

function showNoDeviceBanner() {
  const b = document.getElementById('no-device-banner');
  if (b) b.style.display = 'flex';
  const playBtn = document.getElementById('play-btn');
  if (playBtn) playBtn.disabled = true;
}

function hideNoDeviceBanner() {
  const b = document.getElementById('no-device-banner');
  if (b) b.style.display = 'none';
  const playBtn = document.getElementById('play-btn');
  if (playBtn) playBtn.disabled = false;
}

async function retryDevices() {
  const device = await refreshDevices();
  // If a track is loaded but paused due to no device, auto-play after finding one
  if (device && currentTrackUri && !isPlaying) {
    await playTrack(currentTrackUri);
  }
}

async function playTrack(uri) {
  currentTrackUri = uri;
  if (!uri) return;

  // On desktop the SDK manages deviceId directly — skip REST device lookup if already ready
  if (!spotifyPlayer) {
    // REST path (iOS or SDK not yet ready): always re-query devices before playing
    const statusEl = document.getElementById('player-status');
    if (statusEl) statusEl.textContent = 'Finding device…';
    const data = await spotifyFetch('/me/player/devices');
    if (!data || !data.devices || !data.devices.length) {
      deviceId = null;
      showNoDeviceBanner();
      if (statusEl) statusEl.textContent = 'No device found';
      return;
    }
    hideNoDeviceBanner();
    const active = data.devices.find(d => d.is_active);
    const any = data.devices[0];
    if (active) {
      deviceId = active.id;
    } else {
      // Found a device but it's not active — transfer playback to wake it
      deviceId = any.id;
      if (statusEl) statusEl.textContent = '⚡ Waking ' + any.name + '…';
      await spotifyFetch('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
      await new Promise(r => setTimeout(r, 800));
    }
    if (statusEl) statusEl.textContent = '♫ Playing…';
  }

  if (!deviceId) {
    showNoDeviceBanner();
    return;
  }

  document.getElementById('vinyl-disc').classList.add('playing');
  const statusEl = document.getElementById('player-status');
  if (statusEl) statusEl.textContent = '♫ Playing…';
  await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: 30000 })
  });
  isPlaying = true;
  document.getElementById('play-btn').textContent = '⏸';
}

async function stopPlayback() {
  isPlaying = false;
  document.getElementById('play-btn').textContent = '▶';
  document.getElementById('vinyl-disc').classList.remove('playing');
  if (isIOS) return; // never interrupt playback on iOS
  if (spotifyPlayer) {
    spotifyPlayer.pause().catch(() => {});
  } else if (deviceId) {
    await spotifyFetch('/me/player/pause', { method: 'PUT' }).catch(() => {});
  }
}

async function togglePlayback() {
  if (isPlaying) {
    await stopPlayback();
  } else if (currentTrackUri) {
    await playTrack(currentTrackUri);
  }
}
