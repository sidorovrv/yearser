// ============================================================
//  CONFIG
//  HARDCODED_CLIENT_ID is replaced at deploy time by GitHub Actions.
//  The placeholder string is safe to commit — it contains no real secret.
// ============================================================
const HARDCODED_CLIENT_ID = '__SPOTIFY_CLIENT_ID__';
const REDIRECT_URI = window.location.origin + window.location.pathname;

// PartyKit server host — update after `npx partykit deploy`
// For local dev, run `npx partykit dev` and leave as 'localhost:1999'
const PARTYKIT_HOST = '__PARTYKIT_HOST__';

const SCOPES = [
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming'
].join(' ');
