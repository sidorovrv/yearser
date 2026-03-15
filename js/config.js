// ============================================================
//  CONFIG
//  HARDCODED_CLIENT_ID is replaced at deploy time by GitHub Actions.
//  The placeholder string is safe to commit — it contains no real secret.
// ============================================================
const HARDCODED_CLIENT_ID = '__SPOTIFY_CLIENT_ID__';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = [
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming'
].join(' ');
